/**
 * SSRF protection guard — SI-08.
 *
 * Blocks requests to private/loopback/link-local IP ranges before the
 * HTTP connection is opened. Called once per request; throws SsrfError
 * if the URL is disallowed.
 *
 * Default blocked CIDRs (configured via SSRF_BLOCKED_CIDRS):
 *   10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   127.0.0.0/8 (loopback)
 *   ::1/128, fc00::/7 (IPv6 loopback + ULA)
 *
 * Cloud metadata endpoints (169.254.169.254) are also blocked by the
 * 169.254.0.0/16 range which is added here unconditionally regardless
 * of config — this prevents IMDS credential theft in all environments.
 */

import { lookup as dnsLookup } from 'node:dns/promises';

export type LookupFn = typeof dnsLookup;

/** Swappable DNS lookup — replace in tests via `ssrf._dns.lookup = myMock` */
export const _dns: { lookup: LookupFn } = { lookup: dnsLookup };

export class SsrfError extends Error {
  constructor(url: string, reason: string) {
    super(`SSRF guard blocked request to ${url}: ${reason}`);
    this.name = 'SsrfError';
  }
}

/** Parse a CIDR string into network address (as BigInt) and prefix length. */
function parseCidr(cidr: string): { network: bigint; prefixLen: number; v6: boolean } {
  const [addr, lenStr] = cidr.split('/');
  if (!addr || !lenStr) throw new Error(`Invalid CIDR: ${cidr}`);
  const prefixLen = parseInt(lenStr, 10);
  const v6 = addr.includes(':');
  const network = ipToBigInt(addr, v6);
  return { network, prefixLen, v6 };
}

function ipToBigInt(ip: string, v6: boolean): bigint {
  if (!v6) {
    // IPv4
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) throw new Error(`Invalid IPv4: ${ip}`);
    return parts.reduce((acc, octet) => (acc << 8n) | BigInt(octet), 0n);
  }
  // IPv6 — expand :: shorthand
  const expanded = expandIPv6(ip);
  return expanded
    .split(':')
    .reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function expandIPv6(ip: string): string {
  if (ip.includes('::')) {
    const [left, right] = ip.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    const middle = Array(missing).fill('0000');
    return [...leftGroups, ...middle, ...rightGroups].join(':');
  }
  return ip;
}

function isInCidr(ip: string, cidr: { network: bigint; prefixLen: number; v6: boolean }): boolean {
  const v6 = ip.includes(':');
  if (v6 !== cidr.v6) return false; // Different address families
  try {
    const addr = ipToBigInt(ip, v6);
    const totalBits = v6 ? 128n : 32n;
    const shift = totalBits - BigInt(cidr.prefixLen);
    return (addr >> shift) === (cidr.network >> shift);
  } catch {
    return false;
  }
}

// Cloud metadata endpoints — ALWAYS blocked, regardless of config (SI-08)
const ALWAYS_BLOCKED = [
  '169.254.0.0/16',   // Link-local + AWS/GCP/Azure IMDS
  '100.64.0.0/10',    // Carrier-grade NAT
].map(parseCidr);

/** Check if an IP is blocked by any CIDR in the list. */
function isBlocked(ip: string, blocked: ReturnType<typeof parseCidr>[]): boolean {
  return [...ALWAYS_BLOCKED, ...blocked].some((cidr) => isInCidr(ip, cidr));
}

export interface SsrfGuardOptions {
  /** Parsed CIDR blocks from config. */
  blockedCidrs: ReturnType<typeof parseCidr>[];
  /** Additional hostnames to block (exact match). */
  blockedHostnames?: Set<string>;
}

let _parsedCidrs: ReturnType<typeof parseCidr>[] | undefined;

/** Pre-parse CIDR strings once at startup. */
export function buildSsrfGuard(rawCidrs: string[]): SsrfGuardOptions {
  if (!_parsedCidrs) {
    _parsedCidrs = rawCidrs.map(parseCidr);
  }
  return {
    blockedCidrs: _parsedCidrs,
    blockedHostnames: new Set(['metadata.google.internal', 'metadata.internal']),
  };
}

/**
 * Assert that the given URL is safe to fetch.
 * Resolves the hostname via DNS and checks every returned address.
 *
 * @throws {SsrfError} if the URL is disallowed.
 */
export async function assertSsrfSafe(
  url: string,
  guard: SsrfGuardOptions,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(url, 'Unparseable URL');
  }

  const { hostname, protocol } = parsed;

  // Only HTTP/HTTPS allowed
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SsrfError(url, `Protocol ${protocol} not allowed`);
  }

  // Blocked hostnames
  if (guard.blockedHostnames?.has(hostname)) {
    throw new SsrfError(url, `Hostname ${hostname} is blocked`);
  }

  // Resolve DNS — block if ANY returned address is private
  let addresses: string[];
  try {
    const results = await _dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new SsrfError(url, `DNS resolution failed for ${hostname}`);
  }

  for (const addr of addresses) {
    if (isBlocked(addr, guard.blockedCidrs)) {
      throw new SsrfError(url, `Resolved to blocked address ${addr}`);
    }
  }
}
