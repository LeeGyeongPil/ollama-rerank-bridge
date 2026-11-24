/** nDCG@k with graded gains: DCG = sum(rel_i / log2(i + 2)), divided by the ideal DCG. */
export function ndcgAtK(rels: number[], k: number): number {
  const dcg = (xs: number[]): number => xs.slice(0, k).reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
  const ideal = dcg([...rels].sort((a, b) => b - a));
  return ideal === 0 ? 0 : dcg(rels) / ideal;
}

/** Reciprocal rank of the first relevant (rel > 0) item; 0 when none. */
export function mrr(rels: number[]): number {
  const i = rels.findIndex((r) => r > 0);
  return i < 0 ? 0 : 1 / (i + 1);
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Order indices by score descending; ties keep the original order. */
export function rankByScore(scores: number[]): number[] {
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.i);
}
