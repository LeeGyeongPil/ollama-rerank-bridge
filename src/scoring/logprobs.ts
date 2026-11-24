import { DEFAULT_INSTRUCTION } from "../config.js";
import { LogprobsUnsupportedError } from "../errors.js";
import type { OllamaClient, TopLogprob } from "../ollama.js";

const SYSTEM =
  'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".';

/** The exact Qwen3-Reranker prompt from the model card (raw mode, empty think block). */
export function buildPrompt(query: string, doc: string, instruction: string = DEFAULT_INSTRUCTION): string {
  return (
    "<|im_start|>system\n" +
    SYSTEM +
    "<|im_end|>\n<|im_start|>user\n" +
    "<Instruct>: " + instruction + "\n<Query>: " + query + "\n<Document>: " + doc +
    "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
  );
}

export interface YesNoScore {
  /** P(yes) / (P(yes) + P(no)) with variants summed (the bridge score). */
  score: number;
  /** Same candidates but only the exact lowercase tokens "yes"/"no" (what a naive reader sees). */
  naive: number;
  /** How many sides (yes/no) had to be replaced by the floor value: 0, 1 or 2. */
  floorUsed: number;
  /** True when neither a yes nor a no variant was among the candidates. */
  neutral: boolean;
  /** Distinct yes/no variants found, e.g. ["Yes", " yes", "No"]. */
  variants: string[];
  /** True when the only yes/no tokens found are not the exact lowercase ones. */
  naiveBlind: boolean;
}

const isYes = (t: string): boolean => t.trim().toLowerCase() === "yes";
const isNo = (t: string): boolean => t.trim().toLowerCase() === "no";

/**
 * Turn the first-token candidates into a relevance score.
 * - yes/no variants differing in case or leading space are summed (`Not`, `<think>` ignored).
 * - A missing side gets the lowest candidate probability as an upper bound.
 * - Neither side present: neutral 0.5.
 */
export function scoreFromTopLogprobs(top: TopLogprob[]): YesNoScore {
  const floor = top.length > 0 ? Math.min(...top.map((t) => t.logprob)) : -20;
  let yes = 0;
  let no = 0;
  let yesLower = 0;
  let noLower = 0;
  let hasYes = false;
  let hasNo = false;
  let hasYesLower = false;
  let hasNoLower = false;
  const variants: string[] = [];
  for (const { token, logprob } of top) {
    const p = Math.exp(logprob);
    if (isYes(token)) {
      yes += p;
      hasYes = true;
      variants.push(token);
      if (token === "yes") {
        yesLower += p;
        hasYesLower = true;
      }
    } else if (isNo(token)) {
      no += p;
      hasNo = true;
      variants.push(token);
      if (token === "no") {
        noLower += p;
        hasNoLower = true;
      }
    }
  }
  const floorP = Math.exp(floor);
  const combine = (y: number, n: number): number => y / (y + n);

  let floorUsed = 0;
  let score = 0.5;
  const neutral = !hasYes && !hasNo;
  if (!neutral) {
    if (!hasYes) floorUsed += 1;
    if (!hasNo) floorUsed += 1;
    score = combine(hasYes ? yes : floorP, hasNo ? no : floorP);
  }
  // Naive reader: exact lowercase tokens only, same floor rule, neutral when both are absent.
  let naive = 0.5;
  if (hasYesLower || hasNoLower) {
    naive = combine(hasYesLower ? yesLower : floorP, hasNoLower ? noLower : floorP);
  }
  const naiveBlind = !neutral && !hasYesLower && !hasNoLower;
  return { score, naive, floorUsed, neutral, variants, naiveBlind };
}

export interface PairResult extends YesNoScore {
  promptTokens: number;
  firstToken: string;
}

/** Score one (query, document) pair through Ollama `/api/generate`. */
export async function scorePair(
  client: OllamaClient,
  model: string,
  query: string,
  doc: string,
  instruction: string,
  signal?: AbortSignal,
): Promise<PairResult> {
  const res = await client.generateLogprobs(model, buildPrompt(query, doc, instruction), signal);
  if (res.topLogprobs === undefined) throw new LogprobsUnsupportedError();
  const first = res.topLogprobs[0]?.token ?? "";
  return { ...scoreFromTopLogprobs(res.topLogprobs), promptTokens: res.promptTokens, firstToken: first };
}
