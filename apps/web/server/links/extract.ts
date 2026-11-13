import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { parse, defaultTreeAdapter as tree, type DefaultTreeAdapterTypes } from "parse5";
import { parsePublicWebUrl } from "./url.ts";

export class ExtractionError extends Error {
  readonly code: string;
  readonly transient: boolean;

  constructor(code: string, transient = false) {
    super(code);
    this.code = code;
    this.transient = transient;
  }
}

const maxBodyBytes = 512 * 1024;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const skipTags = new Set(["script", "style", "nav", "header", "footer", "aside", "noscript", "template", "svg", "iframe", "form"]);
const globalV6 = ipaddr.parseCIDR("2000::/3");

export function isPublicAddress(address: string) {
  if (address.includes("%") || address === "168.63.129.16" || !isIP(address)) return false;
  const ip = ipaddr.parse(address);
  return ip.range() === "unicast" && (ip.kind() === "ipv4" || ip.match(globalV6));
}

type Address = { address: string; family: number };
type FetchDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  open: (url: URL, address: Address, signal: AbortSignal) => Promise<IncomingMessage>;
};

function openPage(url: URL, address: Address, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = request(url, {
      agent: false,
      signal,
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": "LifeInbox/1.0" },
    }, resolve);
    outgoing.once("error", reject);
    outgoing.end();
  });
}

const network: FetchDependencies = {
  resolve: (hostname) => lookup(`${hostname}.`, { all: true }),
  open: openPage,
};

async function resolveWithDeadline(hostname: string, signal: AbortSignal, resolve: FetchDependencies["resolve"]) {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      resolve(hostname),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

async function readHtml(response: IncomingMessage) {
  const contentType = response.headers["content-type"] ?? "";
  if (!/^text\/html(?:\s*;|$)/i.test(contentType) ||
      !/^(?:identity)?$/i.test(response.headers["content-encoding"] ?? "")) {
    throw new ExtractionError("UNSUPPORTED_RESPONSE");
  }
  if (Number(response.headers["content-length"]) > maxBodyBytes) throw new ExtractionError("RESPONSE_TOO_LARGE");

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new ExtractionError("RESPONSE_TOO_LARGE");
    chunks.push(chunk);
  }
  const charset = /;\s*charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(Buffer.concat(chunks));
  } catch {
    throw new ExtractionError("UNSUPPORTED_RESPONSE");
  }
}

export async function fetchPublicHtml(originalUrl: string, dependencies = network) {
  const signal = AbortSignal.timeout(12_000);
  let target = parsePublicWebUrl(originalUrl);
  try {
    for (let hop = 0; hop <= 4; hop++) {
      if (!target) throw new ExtractionError("SOURCE_BLOCKED");
      const addresses = await resolveWithDeadline(target.hostname, signal, dependencies.resolve);
      if (!addresses.length) throw new ExtractionError("NETWORK_ERROR", true);
      if (addresses.some(({ address, family }) =>
        family !== isIP(address) || !isPublicAddress(address))) throw new ExtractionError("SOURCE_BLOCKED");
      const address = addresses.find((entry) => entry.family === 4) ?? addresses[0];
      const response = await dependencies.open(target, address, signal);
      try {
        const status = response.statusCode ?? 0;
        if (redirectStatuses.has(status)) {
          if (!response.headers.location || hop === 4) throw new ExtractionError("REDIRECT_FAILED");
          try {
            target = parsePublicWebUrl(new URL(response.headers.location, target).href);
          } catch {
            throw new ExtractionError("REDIRECT_FAILED");
          }
          continue;
        }
        if (status < 200 || status >= 300) {
          throw new ExtractionError("HTTP_ERROR", status === 408 || status === 429 || status >= 500);
        }
        return await readHtml(response);
      } finally {
        response.destroy();
      }
    }
    throw new ExtractionError("REDIRECT_FAILED");
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(signal.aborted ? "TIMEOUT" : "NETWORK_ERROR", true);
  }
}

type Node = DefaultTreeAdapterTypes.Node;

function* descendants(root: Node) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (tree.isElementNode(node) && (skipTags.has(node.tagName) || node.attrs.some(({ name, value }) =>
      name === "hidden" || (name === "aria-hidden" && value === "true")))) continue;
    yield node;
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push(node.childNodes[index]);
    }
  }
}

function plainText(node: Node, limit: number) {
  const parts: string[] = [];
  let length = 0;
  for (const child of descendants(node)) {
    if (!tree.isTextNode(child)) continue;
    const value = child.value.replace(/\s+/g, " ").trim();
    if (!value) continue;
    parts.push(value);
    length += value.length + 1;
    if (length >= limit) break;
  }
  return parts.join(" ").slice(0, limit).trim();
}

export function extractHtml(html: string) {
  const document = parse(html);
  let title: string | null = null;
  let description: string | null = null;
  let body: Node | undefined;
  let main: Node | undefined;
  for (const node of descendants(document)) {
    if (!tree.isElementNode(node)) continue;
    if (node.tagName === "title" && !title) title = plainText(node, 200) || null;
    if (node.tagName === "meta" && !description &&
        node.attrs.some(({ name, value }) => name === "name" && value.toLowerCase() === "description")) {
      description = node.attrs.find(({ name }) => name === "content")?.value.replace(/\s+/g, " ").trim().slice(0, 500) || null;
    }
    if (node.tagName === "body") body = node;
    if ((node.tagName === "main" || node.tagName === "article") && !main) main = node;
  }
  const text = (main && plainText(main, 50_000)) || (body && plainText(body, 50_000));
  if (!text) throw new ExtractionError("NO_TEXT");
  return { title, description, text };
}
