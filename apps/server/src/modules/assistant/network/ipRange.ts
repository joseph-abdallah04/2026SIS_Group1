// Classifies an IP address as publicly routable or not.
//
// This is the decision the SSRF guard is built on: "bring your own provider" means a
// logged-in user chooses a URL the server will then fetch, so without this check the
// assistant is a proxy into the private network it runs in — cloud metadata endpoints
// (169.254.169.254), internal admin panels, the database host, other containers.
//
// Everything that is not unambiguously public counts as private. Getting this wrong in
// the permissive direction is a vulnerability; getting it wrong in the strict direction
// is a support ticket, so the list errs long.
import net from 'node:net';

/** IPv4 blocks that must never be reached from a user-supplied URL. */
const BLOCKED_IPV4_BLOCKS: ReadonlyArray<readonly [address: string, prefix: number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918 private
  ['100.64.0.0', 10], // RFC 6598 carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — includes the cloud metadata endpoint
  ['172.16.0.0', 12], // RFC 1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC 1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and 255.255.255.255 broadcast
];

/** IPv6 blocks, as [first bytes, prefix length in bits]. */
const BLOCKED_IPV6_BLOCKS: ReadonlyArray<readonly [address: string, prefix: number]> = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard-only
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];

/**
 * True when `address` is loopback, private, link-local, or otherwise not routable on the
 * public internet. Anything unparseable is treated as private — an address we cannot
 * reason about is not one we should connect to.
 */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const value = ipv4ToInt(address);
    return (
      value === null ||
      BLOCKED_IPV4_BLOCKS.some(([block, prefix]) => inIpv4Block(value, block, prefix))
    );
  }

  if (net.isIPv6(address)) {
    const bytes = ipv6ToBytes(address);
    if (bytes === null) return true;

    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-translated (64:ff9b::a.b.c.d) addresses reach
    // an IPv4 destination, so they have to be judged as that destination rather than as a
    // v6 address that happens to fall outside every blocked v6 block.
    const embedded = embeddedIpv4(bytes);
    if (embedded !== null) return isPrivateAddress(embedded);

    return BLOCKED_IPV6_BLOCKS.some(([block, prefix]) => inIpv6Block(bytes, block, prefix));
  }

  return true;
}

function inIpv4Block(value: number, block: string, prefix: number): boolean {
  const base = ipv4ToInt(block);
  if (base === null) return false;
  // `>>> 0` keeps the mask unsigned; a /0 shift by 32 is undefined in JS, but no block
  // here uses one.
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

function inIpv6Block(bytes: Uint8Array, block: string, prefix: number): boolean {
  const base = ipv6ToBytes(block);
  if (base === null) return false;

  const wholeBytes = prefix >> 3;
  for (let i = 0; i < wholeBytes; i += 1) {
    if (bytes[i] !== base[i]) return false;
  }

  const remainingBits = prefix & 7;
  if (remainingBits === 0) return true;

  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return ((bytes[wholeBytes] ?? 0) & mask) === ((base[wholeBytes] ?? 0) & mask);
}

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    // Reject anything Number() would be lenient about: '', '01', '1e2', ' 1'.
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

/** Expands any valid IPv6 text form — including `::` and a trailing IPv4 — to 16 bytes. */
function ipv6ToBytes(address: string): Uint8Array | null {
  // A zone index (fe80::1%eth0) names an interface, not part of the address.
  const zoned = address.split('%', 1)[0] ?? address;

  const halves = zoned.split('::');
  if (halves.length > 2) return null;

  const head = parseIpv6Groups(halves[0]);
  if (head === null) return null;

  if (halves.length === 1) {
    // No `::`, so the groups must account for all 16 bytes on their own.
    return head.length === 16 ? Uint8Array.from(head) : null;
  }

  const tail = parseIpv6Groups(halves[1]);
  if (tail === null || head.length + tail.length > 16) return null;

  // The gap between head and tail is the run of zeros `::` stands in for.
  const bytes = new Uint8Array(16);
  bytes.set(head, 0);
  bytes.set(tail, 16 - tail.length);
  return bytes;
}

/** Parses a colon-separated run of hex groups, optionally ending in a dotted quad. */
function parseIpv6Groups(text: string | undefined): number[] | null {
  if (!text) return [];

  const groups = text.split(':');
  const bytes: number[] = [];

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i] as string;

    // Only the final group may be dotted-quad: ::ffff:192.0.2.1
    if (group.includes('.')) {
      if (i !== groups.length - 1) return null;
      const embedded = ipv4ToInt(group);
      if (embedded === null) return null;
      bytes.push(
        (embedded >>> 24) & 0xff,
        (embedded >>> 16) & 0xff,
        (embedded >>> 8) & 0xff,
        embedded & 0xff,
      );
      continue;
    }

    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push((value >>> 8) & 0xff, value & 0xff);
  }

  return bytes.length <= 16 ? bytes : null;
}

/** The IPv4 address inside an IPv4-mapped or IPv4-translated IPv6 address, if any. */
function embeddedIpv4(bytes: Uint8Array): string | null {
  const startsWith = (prefix: number[]): boolean =>
    prefix.every((byte, index) => bytes[index] === byte);

  // ::ffff:0:0/96 — IPv4-mapped
  if (startsWith([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff])) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  // 64:ff9b::/96 — NAT64 well-known prefix
  if (startsWith([0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0])) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  return null;
}
