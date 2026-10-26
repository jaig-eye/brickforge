/**
 * Tests never reach the internet. The fake API server listens on 127.0.0.1;
 * every other host (the catalog image CDNs named in the recorded fixtures, or
 * a real endpoint a code path forgot to route through serviceUrl) fails the
 * way it would on an offline machine, and is logged here so a test can
 * assert it never happened.
 */
export const blockedRequests: string[] = []

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const realFetch = globalThis.fetch

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = new URL(urlOf(input))
  if (!LOCAL_HOSTS.has(url.hostname)) {
    blockedRequests.push(url.href)
    const cause = Object.assign(new Error(`getaddrinfo ENOTFOUND ${url.hostname}`), { code: 'ENOTFOUND' })
    throw new TypeError('fetch failed', { cause })
  }
  return realFetch(input, init)
}) as typeof fetch
