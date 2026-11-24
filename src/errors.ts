import { t, type Lang, type MessageKey } from "./i18n.js";

type Vars = Record<string, string | number>;

/** An error that maps to an HTTP status in the bridge API (messages are English). */
export class BridgeError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly type: string = "bridge_error",
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

/**
 * Errors shown on the command line carry a message key and variables, so the
 * CLI can print them in the chosen language. `message` is always the English text
 * (used for logs, JSON output and HTTP bodies).
 */
export interface Localized {
  readonly key: MessageKey;
  readonly vars: Vars;
}

/** The Ollama answer had no `logprobs` field (Ollama older than 0.12.11). */
export class LogprobsUnsupportedError extends Error implements Localized {
  readonly key: MessageKey = "error.noLogprobs";
  readonly vars: Vars = {};
  constructor() {
    super(t("en", "error.noLogprobs"));
    this.name = "LogprobsUnsupportedError";
  }
}

/** Ollama could not be reached or answered with an HTTP error. */
export class OllamaError extends Error implements Localized {
  constructor(
    public readonly kind: "unreachable" | "http" | "timeout",
    public readonly key: MessageKey,
    public readonly vars: Vars = {},
    public readonly status?: number,
  ) {
    super(t("en", key, vars));
    this.name = "OllamaError";
  }
}

/** Wrong command line or input file: exit code 1. */
export class UsageError extends Error implements Localized {
  constructor(
    public readonly key: MessageKey,
    public readonly vars: Vars = {},
  ) {
    super(t("en", key, vars));
    this.name = "UsageError";
  }
}

function isLocalized(err: unknown): err is Error & Localized {
  return err instanceof Error && typeof (err as Partial<Localized>).key === "string";
}

/** The text of an error in the screen language (plain errors keep their own message). */
export function localize(err: unknown, lang: Lang): string {
  if (isLocalized(err)) return t(lang, err.key, err.vars);
  return err instanceof Error ? err.message : String(err);
}
