import { lookup as dnsLookup, type LookupAddress } from "node:dns";

import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * A fetch that can only reach the public internet.
 *
 * The link import fetches whatever address a person pastes, from the
 * server's own position on the network. `isPublicHost` refuses an address
 * that is plainly internal, but a public-looking name can still resolve to
 * an internal address - and can answer a different address the second time
 * it is asked, so checking the name and then fetching it leaves a gap.
 *
 * This closes it where it can be closed: inside the connection itself. Every
 * address the name resolves to is checked against the same rule the
 * assistants' sign-in library uses for its own fetches
 * (`isPublicRoutableHost`: loopback, private, link-local, cloud metadata,
 * IPv4-mapped forms and the rest), at the moment of connecting, and the
 * connection only goes to an address that passed.
 */

/** Refused because the name led somewhere inward. */
export class NonPublicAddressError extends Error {
  constructor(hostname: string) {
    super(`refused to connect inward for ${hostname}`);
    this.name = "NonPublicAddressError";
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `dns.lookup`, refusing every answer unless all of them are public. All,
 * not some: a name answering one public and one private address could be
 * connected to either.
 */
export function publicOnlyLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: LookupCallback,
  resolve: typeof dnsLookup = dnsLookup,
): void {
  resolve(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as LookupAddress[];
    if (
      list.length === 0 ||
      list.some((entry) => !isPublicRoutableHost(entry.address))
    ) {
      return callback(new NonPublicAddressError(hostname), []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({
  connect: {
    lookup: publicOnlyLookup as unknown as never,
  },
});

/** Drop-in for `fetch`, for addresses that came from a person. */
export const publicOnlyFetch = (
  url: string,
  init: RequestInit,
): Promise<Response> =>
  undiciFetch(url, {
    ...(init as object),
    dispatcher: agent,
  }) as unknown as Promise<Response>;
