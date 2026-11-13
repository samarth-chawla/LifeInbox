import "server-only";
import { isIP } from "node:net";
import { maxUrlLength } from "../../lib/saved-links.ts";

export function parsePublicWebUrl(value: unknown): URL | null {
  // Reject characters the URL parser would otherwise strip or reinterpret.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== "string" || value.length > maxUrlLength || /[\x00-\x20\x7f\\]/.test(value) ||
      !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.username || url.password || url.port || host.length > 253 || host.endsWith(".") || isIP(host) ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host) ||
        /\.(?:localhost|local|internal|test|invalid|example|onion|arpa)$/i.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}
