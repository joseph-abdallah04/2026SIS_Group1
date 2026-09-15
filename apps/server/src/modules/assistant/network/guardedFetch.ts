// SSRF guard for outbound calls to a user-supplied URL.
//
// The base URL of the LLM provider is typed by whoever is logged in, and the server then
// fetches it with the server's own network position. Without a guard that is a
// general-purpose proxy into everything the server can reach but the user cannot.
//
// Two layers, on purpose:
//
//   1. `assertPublicUrl` runs up front. It gives the user a clear, actionable error at the
//      moment they save a config or start a turn, instead of a generic "fetch failed".
//   2. `guardedFetch` validates again inside the connection's DNS lookup. This is the layer
//      that actually enforces the policy: a hostname can resolve to a public address for
//      the check in (1) and a private one microseconds later when the socket opens (DNS
//      rebinding). Deciding at connect time closes that window, because the address the
//      check approves is the address the socket connects to.
//
// Local providers make this a policy rather than a ban: Ollama and LM Studio live on
// loopback, so development allows private targets and production does not
// (`ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS`).
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import net from 'node:net';

import { Agent } from 'undici';

import { ApiError } from '../../../middleware/error.js';
import { isPrivateAddress } from './ipRange.js';

/** Raised when a target is refused. Carries the host so the caller can name it. */
export class BlockedHostError extends Error {
  constructor(
    readonly host: string,
    reason: string,
  ) {
    super(reason);
    this.name = 'BlockedHostError';
  }
}

export interface HostPolicy {
  /** Allow targets that resolve to loopback, private, or link-local addresses. */
  allowPrivateHosts: boolean;
}

/**
 * Validates the shape of a user-supplied URL, then that it resolves somewhere we are
 * willing to connect to.
 *
 * Throws `ApiError` so the message reaches the user as-is — a wrong base URL is the single
 * most common setup mistake, and "that host is not reachable" is far more useful than a
 * stack trace.
 */
export async function assertPublicUrl(rawUrl: string, policy: HostPolicy): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, `"${rawUrl}" is not a valid URL`, 'LLM_URL_INVALID');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(
      400,
      `Base URL must use http or https, not ${url.protocol.replace(':', '')}`,
      'LLM_URL_INVALID',
    );
  }

  // Credentials in the URL would be sent to the host and written into any log that records
  // the URL. The API key belongs in the Authorization header.
  if (url.username || url.password) {
    throw new ApiError(
      400,
      'Base URL must not embed a username or password — the API key field is the place for credentials',
      'LLM_URL_INVALID',
    );
  }

  if (policy.allowPrivateHosts) return;

  for (const address of await resolveHost(url.hostname)) {
    if (isPrivateAddress(address)) {
      throw new ApiError(
        400,
        `Base URL must point at a public host; ${url.hostname} resolves to the private address ${address}`,
        'LLM_URL_PRIVATE_HOST',
      );
    }
  }
}

/**
 * A `fetch` that refuses to open a socket to a disallowed address.
 *
 * Agents are memoised per policy so connections are still pooled and keep-alive still
 * works; there are only ever two of them.
 */
export function guardedFetch(policy: HostPolicy): typeof globalThis.fetch {
  const dispatcher = agentFor(policy);

  return (input, init) =>
    // `dispatcher` is an undici option that Node's global fetch honours at runtime but
    // does not declare on RequestInit.
    globalThis.fetch(input, { ...init, dispatcher } as RequestInit);
}

const agents = new Map<boolean, Agent>();

function agentFor(policy: HostPolicy): Agent {
  const existing = agents.get(policy.allowPrivateHosts);
  if (existing) return existing;

  const agent = new Agent({
    connect: {
      // Called by the socket layer with the hostname it is about to connect to. Returning
      // an error here aborts the connection before any bytes leave the process.
      lookup(hostname, options, callback) {
        // An IP literal in the URL never reaches DNS, so check it directly.
        if (net.isIP(hostname)) {
          if (!policy.allowPrivateHosts && isPrivateAddress(hostname)) {
            callback(new BlockedHostError(hostname, `${hostname} is not a public address`), '', 0);
            return;
          }
          const family = net.isIPv6(hostname) ? 6 : 4;
          callback(null, options.all ? [{ address: hostname, family }] : hostname, family);
          return;
        }

        dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
          if (error) {
            callback(error, '', 0);
            return;
          }

          const permitted = policy.allowPrivateHosts
            ? addresses
            : addresses.filter((entry) => !isPrivateAddress(entry.address));

          if (permitted.length === 0) {
            callback(
              new BlockedHostError(
                hostname,
                `${hostname} resolves only to private addresses (${addresses
                  .map((entry) => entry.address)
                  .join(', ')})`,
              ),
              '',
              0,
            );
            return;
          }

          const first = permitted[0] as LookupAddress;
          callback(null, options.all ? permitted : first.address, first.family);
        });
      },
    },
  });

  agents.set(policy.allowPrivateHosts, agent);
  return agent;
}

async function resolveHost(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) return [hostname];

  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        reject(
          new ApiError(
            400,
            `Could not resolve ${hostname} — check the base URL`,
            'LLM_URL_UNRESOLVABLE',
          ),
        );
        return;
      }
      resolve(addresses.map((entry) => entry.address));
    });
  });
}
