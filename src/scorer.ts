import { resolveModel, type ScorerConfig } from "./config.js";
import { BridgeError, LogprobsUnsupportedError, OllamaError } from "./errors.js";
import { OllamaClient, type ModelInfo } from "./ollama.js";
import { createLimiter, type Limiter } from "./queue.js";
import { scoreByEmbedding } from "./scoring/embedding.js";
import { scorePair, type PairResult } from "./scoring/logprobs.js";

export interface RerankInput {
  model: string;
  query: string;
  documents: string[];
  /** Per-request character limit (e.g. from Cohere v2 max_tokens_per_doc); never above config.maxChars. */
  maxChars?: number;
  /** Abort the work early, e.g. when the HTTP client disconnected before the answer. */
  abort?: AbortSignal;
}

export interface RerankOutput {
  scores: number[];
  scoring: "logprobs" | "embedding";
  /** Why the embedding fallback was used (only set when it was). */
  fallback?: string;
  warnings: string[];
  tokens: number;
  /** Documents that were cut to the character limit. */
  truncated: number;
}

/** Chooses a scoring method per model, limits concurrency, truncates, and enforces the timeout. */
export class Scorer {
  readonly client: OllamaClient;
  private readonly limiter: Limiter;
  private readonly modelInfo = new Map<string, ModelInfo>();

  constructor(public readonly config: ScorerConfig, client?: OllamaClient) {
    this.client = client ?? new OllamaClient(config.ollamaUrl);
    this.limiter = createLimiter(config.concurrency);
  }

  private async info(model: string, signal: AbortSignal): Promise<ModelInfo> {
    const cached = this.modelInfo.get(model);
    if (cached) return cached;
    try {
      const info = await this.client.show(model, signal);
      if (this.modelInfo.size >= 64) this.modelInfo.clear(); // keep the cache bounded
      this.modelInfo.set(model, info);
      return info;
    } catch (err) {
      if (err instanceof OllamaError && err.kind === "http" && err.status === 404) {
        throw new BridgeError(404, `model "${model}" not found in Ollama; check "ollama list" or add --alias`, "model_not_found");
      }
      throw err;
    }
  }

  async rerank(input: RerankInput): Promise<RerankOutput> {
    const cfg = this.config;
    const timeout = AbortSignal.timeout(cfg.timeoutMs);
    const signal = input.abort ? AbortSignal.any([timeout, input.abort]) : timeout;
    try {
      return await this.rerankInner(input, signal);
    } catch (err) {
      throw this.translate(err, timeout);
    }
  }

  private translate(err: unknown, signal: AbortSignal): Error {
    if (err instanceof BridgeError) return err;
    if (signal.aborted || (err instanceof OllamaError && err.kind === "timeout")) {
      return new BridgeError(
        504,
        `rerank timed out after ${Math.round(this.config.timeoutMs / 1000)}s; raise --timeout, lower the document count, or use a smaller model`,
        "timeout",
      );
    }
    if (err instanceof LogprobsUnsupportedError) {
      return new BridgeError(502, `${err.message}. Update Ollama, or pass --fallback-embed <embedding-model>`, "upstream_error");
    }
    if (err instanceof OllamaError) return new BridgeError(502, err.message, "upstream_error");
    return err instanceof Error ? err : new Error(String(err));
  }

  private async rerankInner(input: RerankInput, signal: AbortSignal): Promise<RerankOutput> {
    const cfg = this.config;
    const limit = Math.min(input.maxChars ?? cfg.maxChars, cfg.maxChars);
    let truncated = 0;
    const docs = input.documents.map((d) => {
      if (d.length > limit) {
        truncated += 1;
        return d.slice(0, limit);
      }
      return d;
    });
    const model = resolveModel(cfg.aliases, input.model);
    const info = await this.info(model, signal);
    let mode = cfg.scoring;
    if (mode === "auto") {
      mode = info.capabilities.includes("embedding") && !info.capabilities.includes("completion") ? "embedding" : "logprobs";
    }

    if (mode === "embedding") {
      const scores = await this.limiter.run(() => scoreByEmbedding(this.client, model, input.query, docs, signal));
      return { scores, scoring: "embedding", warnings: [], tokens: estimateTokens(input.query, docs), truncated };
    }

    // On the first failure the remaining pairs are cancelled instead of running to the end.
    const batch = new AbortController();
    const batchSignal = AbortSignal.any([signal, batch.signal]);
    try {
      const results = await Promise.all(
        docs.map((d) =>
          this.limiter.run(async () => {
            if (batchSignal.aborted) throw new OllamaError("timeout", "error.aborted");
            return scorePair(this.client, model, input.query, d, cfg.instruction, batchSignal);
          }),
        ),
      );
      return {
        scores: results.map((r) => r.score),
        scoring: "logprobs",
        warnings: warningsFor(results),
        tokens: results.reduce((s, r) => s + r.promptTokens, 0),
        truncated,
      };
    } catch (err) {
      batch.abort();
      const fallbackModel = cfg.fallbackEmbed;
      const recoverable = err instanceof LogprobsUnsupportedError || (err instanceof OllamaError && err.kind !== "timeout");
      if (!fallbackModel || !recoverable || signal.aborted) throw err;
      const scores = await this.limiter.run(() => scoreByEmbedding(this.client, fallbackModel, input.query, docs, signal));
      return {
        scores,
        scoring: "embedding",
        fallback: `logprobs scoring failed (${(err as Error).message}); used embedding model ${fallbackModel}`,
        warnings: [],
        tokens: estimateTokens(input.query, docs),
        truncated,
      };
    }
  }
}

function estimateTokens(query: string, docs: string[]): number {
  return Math.ceil((query.length * docs.length + docs.reduce((s, d) => s + d.length, 0)) / 4);
}

function warningsFor(results: PairResult[]): string[] {
  const floor = results.filter((r) => r.floorUsed > 0 && !r.neutral).length;
  const neutral = results.filter((r) => r.neutral).length;
  const out: string[] = [];
  if (floor > 0) out.push(`${floor} of ${results.length} documents used the top-20 floor value for a missing yes/no token`);
  if (neutral > 0) out.push(`${neutral} of ${results.length} documents had no yes/no token in the top-20 candidates (score 0.5)`);
  return out;
}
