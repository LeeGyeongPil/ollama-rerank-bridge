import { badRequest } from "./config.js";

export type Style = "cohere" | "cohere-v2" | "tei";

export interface RerankRequest {
  style: Style;
  model: string | undefined;
  query: string;
  documents: string[];
  topN: number | undefined;
  returnDocuments: boolean;
  /** Characters allowed per document (Cohere v2 max_tokens_per_doc * 4). */
  maxChars: number | undefined;
}

function obj(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

/** Normalize Cohere v1/v2, Jina, vLLM, llama-server and TEI request bodies. */
export function parseRequest(path: string, body: unknown): RerankRequest {
  const b = obj(body);
  const isTei = Array.isArray(b["texts"]) && b["documents"] === undefined;
  const style: Style = isTei ? "tei" : path.startsWith("/v2/") ? "cohere-v2" : "cohere";

  const query = b["query"];
  if (typeof query !== "string" || query.trim() === "") throw badRequest('"query" must be a non-empty string');

  const rawDocs = isTei ? b["texts"] : b["documents"];
  const field = isTei ? "texts" : "documents";
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    throw badRequest(`"${field}" must be a non-empty array of strings (or objects with a "text" string)`);
  }
  const documents = rawDocs.map((d, i) => {
    if (typeof d === "string") return d;
    if (typeof d === "object" && d !== null && typeof (d as Record<string, unknown>)["text"] === "string") {
      return (d as { text: string }).text;
    }
    throw badRequest(`"${field}[${i}]" must be a string or an object with a "text" string`);
  });

  const model = b["model"];
  if (model !== undefined && (typeof model !== "string" || model === "")) throw badRequest('"model" must be a non-empty string');

  const topRaw = b["top_n"];
  let topN: number | undefined;
  if (topRaw !== undefined && topRaw !== null) {
    if (typeof topRaw !== "number" || !Number.isInteger(topRaw) || topRaw < 1) {
      throw badRequest('"top_n" must be an integer >= 1');
    }
    topN = topRaw;
  }

  const ret = isTei ? b["return_text"] : b["return_documents"];
  if (ret !== undefined && typeof ret !== "boolean") throw badRequest(`"${isTei ? "return_text" : "return_documents"}" must be a boolean`);

  let maxChars: number | undefined;
  const mt = b["max_tokens_per_doc"];
  if (mt !== undefined) {
    if (typeof mt !== "number" || !Number.isInteger(mt) || mt < 1) throw badRequest('"max_tokens_per_doc" must be an integer >= 1');
    maxChars = mt * 4; // rough characters-per-token estimate
  }

  return {
    style,
    model: model as string | undefined,
    query,
    documents,
    topN,
    returnDocuments: style === "cohere-v2" ? false : ret === true,
    maxChars,
  };
}

export interface ScoredMeta {
  scoring: "logprobs" | "embedding";
  fallback?: string;
  warnings?: string[];
  truncated?: number;
}

/** Sort by score (ties keep the original order), cut to top_n, and shape the response. */
export function buildResponse(
  req: RerankRequest,
  model: string,
  scores: number[],
  tokens: number,
  meta: ScoredMeta,
  id: string,
): unknown {
  const order = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, req.topN ?? scores.length);

  if (req.style === "tei") {
    return order.map(({ score, index }) => ({
      index,
      score,
      ...(req.returnDocuments ? { text: req.documents[index] } : {}),
    }));
  }
  const metaOut: Record<string, unknown> = { scoring: meta.scoring };
  if (meta.fallback) metaOut["fallback"] = meta.fallback;
  if (meta.warnings && meta.warnings.length > 0) metaOut["warnings"] = meta.warnings;
  if (meta.truncated) metaOut["truncated_documents"] = meta.truncated;
  return {
    id,
    model,
    results: order.map(({ score, index }) => ({
      index,
      relevance_score: score,
      ...(req.returnDocuments ? { document: { text: req.documents[index] } } : {}),
    })),
    usage: { total_tokens: tokens },
    meta: metaOut,
  };
}
