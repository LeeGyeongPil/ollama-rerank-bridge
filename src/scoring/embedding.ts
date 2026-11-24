import type { OllamaClient } from "../ollama.js";

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** One batched `/api/embed` call: query first, then every document. */
export async function scoreByEmbedding(
  client: OllamaClient,
  model: string,
  query: string,
  docs: string[],
  signal?: AbortSignal,
): Promise<number[]> {
  const vectors = await client.embed(model, [query, ...docs], signal);
  const q = vectors[0] ?? [];
  return docs.map((_, i) => cosine(q, vectors[i + 1] ?? []));
}
