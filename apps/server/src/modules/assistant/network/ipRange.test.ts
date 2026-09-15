// The allow/deny decision behind the SSRF guard. A false "public" here is a hole straight
// into the private network the server runs in, so the interesting cases are the ones that
// look public at a glance: IPv4-mapped IPv6, the NAT64 prefix, and shortened v6 forms.
import { describe, expect, it } from 'vitest';

import { isPrivateAddress } from './ipRange.js';

describe('isPrivateAddress', () => {
  it('accepts ordinary public IPv4', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '104.18.32.7', '203.0.114.1']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('rejects the RFC 1918 private ranges', () => {
    for (const address of [
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('accepts addresses just outside the private ranges', () => {
    for (const address of [
      '9.255.255.255',
      '11.0.0.1',
      '172.15.255.255',
      '172.32.0.1',
      '192.169.0.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('rejects loopback anywhere in 127/8', () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '127.255.255.254']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  // The reason this file exists: 169.254.169.254 serves cloud instance credentials to
  // anything that can make an HTTP request from the instance.
  it('rejects the link-local range, including the cloud metadata endpoint', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('169.254.0.1')).toBe(true);
  });

  it('rejects carrier-grade NAT, multicast, reserved and broadcast', () => {
    for (const address of [
      '100.64.0.1', // CGNAT
      '0.0.0.0', // this network
      '224.0.0.1', // multicast
      '240.0.0.1', // reserved
      '255.255.255.255', // broadcast
      '198.18.0.1', // benchmarking
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('accepts public IPv6', () => {
    for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('rejects IPv6 loopback, unique-local, link-local and multicast', () => {
    for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  // ::ffff:127.0.0.1 is loopback wearing a v6 costume. Judged as a v6 address it matches
  // no blocked v6 block, so it has to be unwrapped to the v4 address it actually reaches.
  it('sees through IPv4-mapped IPv6', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('sees through the NAT64 well-known prefix', () => {
    expect(isPrivateAddress('64:ff9b::127.0.0.1')).toBe(true);
    expect(isPrivateAddress('64:ff9b::8.8.8.8')).toBe(false);
  });

  it('ignores an IPv6 zone index', () => {
    expect(isPrivateAddress('fe80::1%eth0')).toBe(true);
  });

  it('treats anything unparseable as private', () => {
    for (const address of ['', 'not-an-ip', '1.2.3', '1.2.3.4.5', '999.1.1.1', '01.2.3.4']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });
});
