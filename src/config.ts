import { BridgeError, UsageError } from "./errors.js";

export type ScoringMode = "auto" | "logprobs" | "embedding";

export interface ScorerConfig {
  /** Base URL of Ollama, e.g. http://127.0.0.1:11434 */
  ollamaUrl: string;
  concurrency: number;
  /** Whole-request timeout in milliseconds. */
  timeoutMs: number;
  maxChars: number;
  maxDocs: number;
  fallbackEmbed?: string;
  aliases: Record<string, string>;
  scoring: ScoringMode;
  instruction: string;
}

export const DEFAULT_INSTRUCTION =
  "Given a web search query, retrieve relevant passages that answer the query";

export const DEFAULTS = {
  concurrency: 2,
  timeoutSec: 60,
  maxChars: 4000,
  maxDocs: 200,
  port: 8100,
  host: "127.0.0.1",
} as const;

/**
 * Turn an `OLLAMA_HOST`-style value into a base URL.
 * Same rules as Ollama itself: `host:port`, no scheme required, `0.0.0.0` means local.
 */
export function normalizeOllamaHost(value: string | undefined): string {
  let raw = (value ?? "").trim();
  if (raw === "") return "http://127.0.0.1:11434";
  let scheme = "http";
  const m = /^(https?):\/\//i.exec(raw);
  if (m) {
    scheme = (m[1] ?? "http").toLowerCase();
    raw = raw.slice(m[0].length);
  }
  raw = raw.replace(/\/+$/, "");
  let host = raw;
  let port = "11434";
  const idx = raw.lastIndexOf(":");
  if (idx > -1 && !raw.endsWith("]")) {
    host = raw.slice(0, idx);
    port = raw.slice(idx + 1);
  }
  if (host === "" || host === "0.0.0.0") host = "127.0.0.1";
  if (!/^\d+$/.test(port)) {
    throw new UsageError("error.badOllamaHost", { value: value ?? "" });
  }
  return `${scheme}://${host}:${port}`;
}

/** Parse `--alias app-name=ollama-model` values into a map. */
export function parseAliases(values: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of values ?? []) {
    const i = v.indexOf("=");
    if (i < 1 || i === v.length - 1) {
      throw new UsageError("error.badAlias", { value: v });
    }
    out[v.slice(0, i)] = v.slice(i + 1);
  }
  return out;
}

export function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new UsageError("error.notInt", { name, value });
  }
  return n;
}

export function parseScoring(value: string | undefined): ScoringMode {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "logprobs" || value === "embedding") return value;
  throw new UsageError("error.badScoring", { value });
}

export function resolveModel(aliases: Record<string, string>, model: string): string {
  return aliases[model] ?? model;
}

export function badRequest(message: string): BridgeError {
  return new BridgeError(400, message, "invalid_request_error");
}
