import { OllamaError } from "./errors.js";

export interface TopLogprob {
  token: string;
  logprob: number;
}

export interface GenerateResult {
  /** Candidates for the first generated token; undefined when Ollama sent no logprobs. */
  topLogprobs: TopLogprob[] | undefined;
  promptTokens: number;
}

export interface ModelInfo {
  capabilities: string[];
  family: string;
}

/** Minimal Ollama HTTP client: only the endpoints the bridge needs. */
export class OllamaClient {
  constructor(public readonly baseUrl: string) {}

  private async request(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    try {
      const init: RequestInit = { method };
      if (body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
      }
      if (signal) init.signal = signal;
      return await fetch(this.baseUrl + path, init);
    } catch (err) {
      if (signal?.aborted) throw new OllamaError("timeout", "error.aborted");
      throw new OllamaError("unreachable", "error.unreachable", { url: this.baseUrl, reason: describe(err) });
    }
  }

  private async json(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const res = await this.request(method, path, body, signal);
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new OllamaError("http", "error.ollamaHttp", { path, status: res.status, body: text.slice(0, 200) }, res.status);
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new OllamaError("http", "error.ollamaNonJson", { path }, res.status);
    }
  }

  async version(signal?: AbortSignal): Promise<string> {
    const j = await this.json("GET", "/api/version", undefined, signal);
    return String(j["version"] ?? "");
  }

  async show(model: string, signal?: AbortSignal): Promise<ModelInfo> {
    const j = await this.json("POST", "/api/show", { model }, signal);
    const caps = Array.isArray(j["capabilities"]) ? (j["capabilities"] as unknown[]).map(String) : [];
    const details = (j["details"] ?? {}) as Record<string, unknown>;
    return { capabilities: caps, family: String(details["family"] ?? "") };
  }

  /** Does this Ollama already answer on a native /api/rerank? (informational) */
  async hasNativeRerank(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await this.request("POST", "/api/rerank", {}, signal);
      await res.text().catch(() => "");
      return res.status !== 404;
    } catch {
      return false;
    }
  }

  /** One-token raw generation with the top-20 candidates for that token. */
  async generateLogprobs(model: string, prompt: string, signal?: AbortSignal): Promise<GenerateResult> {
    const j = await this.json(
      "POST",
      "/api/generate",
      {
        model,
        prompt,
        raw: true,
        stream: false,
        logprobs: true,
        top_logprobs: 20,
        options: { num_predict: 1, temperature: 0 },
      },
      signal,
    );
    const lp = j["logprobs"];
    const promptTokens = Number(j["prompt_eval_count"] ?? 0) || 0;
    if (!Array.isArray(lp) || lp.length === 0) return { topLogprobs: undefined, promptTokens };
    const first = lp[0] as Record<string, unknown>;
    const out: TopLogprob[] = [];
    const seen = new Set<string>();
    const push = (t: unknown): void => {
      const rec = t as Record<string, unknown>;
      const token = rec["token"];
      const logprob = rec["logprob"];
      if (typeof token === "string" && typeof logprob === "number" && !seen.has(token)) {
        seen.add(token);
        out.push({ token, logprob });
      }
    };
    push(first);
    if (Array.isArray(first["top_logprobs"])) (first["top_logprobs"] as unknown[]).forEach(push);
    return { topLogprobs: out, promptTokens };
  }

  async embed(model: string, input: string[], signal?: AbortSignal): Promise<number[][]> {
    const j = await this.json("POST", "/api/embed", { model, input }, signal);
    const e = j["embeddings"];
    if (!Array.isArray(e) || e.length !== input.length) {
      throw new OllamaError("http", "error.embedUnexpected", { model });
    }
    return e as number[][];
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    return cause?.code ?? err.message;
  }
  return String(err);
}

/** Compare dotted versions; true when `version` >= `min`. Unknown formats count as old. */
export function versionAtLeast(version: string, min: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(version);
  const b = parse(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

export const MIN_LOGPROBS_VERSION = "0.12.11";
