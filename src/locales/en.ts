/** English messages. Keep the key set identical to ko.ts (a test checks it). */
export const en = {
  "banner.mock": "[practice mock mode: a fake Ollama answers, not a real model]",

  "help.main": `ollama-rerank-bridge - a /v1/rerank endpoint on top of your running Ollama

Usage:
  ollama-rerank-bridge serve  [options]    start the rerank server
  ollama-rerank-bridge doctor --model <m>  check that reranking will work
  ollama-rerank-bridge eval   --model <m>  measure nDCG@k and MRR before/after reranking

Common options:
  --ollama <url>        Ollama address (default: OLLAMA_HOST or 127.0.0.1:11434)
  --lang en|ko          screen language (or OLLAMA_RERANK_BRIDGE_LANG)
  --mock                use a built-in fake Ollama (practice mode, no model needed)
  --mock-scenario <s>   healthy | old-ollama | no-yesno | slow (with --mock)
  --version, --help

serve:
  --model <m>           default model when a request has none
  --host <h> --port <n> bind address (default 127.0.0.1:8100)
  --alias <app=model>   map a model name sent by an app to an Ollama model (repeatable)
  --scoring <m>         auto | logprobs | embedding (default auto)
  --fallback-embed <m>  embedding model used when logprobs scoring fails
  --concurrency <n>     parallel Ollama calls (default 2)
  --timeout <sec>       whole-request timeout (default 60)
  --max-chars <n>       cut documents to n characters (default 4000)
  --max-docs <n>        refuse requests with more documents (default 200)
  --instruction <text>  reranker instruction
  --api-key <key>       require Authorization: Bearer <key> (or OLLAMA_RERANK_BRIDGE_API_KEY)

doctor / eval:
  --model <m>           reranker (or embedding) model name in Ollama
  --embed <m>           embedding model to compare against
  --data <file>         eval file (default: bundled examples/sample-eval.json)
  --k <n>               nDCG cut-off (default 3)
  --json                machine-readable output

Exit codes: 0 ok, 1 usage error, 2 a doctor check failed, 3 Ollama unreachable`,

  "error.unknownCommand": 'unknown command "{cmd}"; use serve, doctor or eval (see --help)',
  "error.modelRequired": "--model is required; list your models with: ollama list",
  "error.badLang": '--lang must be "en" or "ko" (got "{value}")',
  "error.mockScenario": '--mock-scenario must be one of {list} (got "{value}")',
  "error.generic": "error: {message}",
  "error.notInt": '--{name} must be an integer >= 1 (got "{value}")',
  "error.badOllamaHost": 'invalid Ollama address "{value}": port must be a number (example: 127.0.0.1:11434)',
  "error.badAlias": 'invalid --alias "{value}": use --alias app-model-name=ollama-model-name',
  "error.badScoring": '--scoring must be auto, logprobs or embedding (got "{value}")',
  "error.badPort": '--port must be 0-65535 (got "{value}")',
  "error.unknownOption": "unknown option {option} (see --help)",
  "error.optionValue": "option {option} needs a valid value (see --help)",
  "error.badArgs": "invalid command line (see --help)",
  "error.evalRead": 'cannot read eval file "{path}"; pass --data <file.json> (see examples/sample-eval.json)',
  "error.evalJson": "{path} is not valid JSON",
  "error.evalNotArray": '{source}: must be a non-empty JSON array. Expected [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] with docs in first-stage search order',
  "error.evalQuery": '{source}: item {i}: "query" must be a non-empty string. Expected [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] with docs in first-stage search order',
  "error.evalDocs": '{source}: item {i}: "docs" must be a non-empty array. Expected [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] with docs in first-stage search order',
  "error.evalDoc": '{source}: item {i} doc {j}: needs "text" (string) and "rel" (number >= 0). Expected [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] with docs in first-stage search order',
  "error.evalNoRel": '{source}: item {i}: at least one doc needs rel > 0. Expected [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] with docs in first-stage search order',
  "error.unreachable": 'cannot reach Ollama at {url} ({reason}); is "ollama serve" running? Use --ollama or OLLAMA_HOST to change the address',
  "error.noLogprobs": "Ollama returned no logprobs; logprobs scoring needs Ollama >= 0.12.11",
  "error.aborted": "request aborted",
  "error.ollamaHttp": "Ollama {path} returned HTTP {status}: {body}",
  "error.ollamaNonJson": "Ollama {path} returned a non-JSON body",
  "error.embedUnexpected": 'Ollama /api/embed returned an unexpected result for model "{model}"',

  "serve.mockStarted": "Practice mock Ollama on {url} (models: {rerank}, {embed})",
  "serve.listening": "Rerank bridge listening on http://{host}:{port}  ->  Ollama {ollama}",
  "serve.try": "Try it (new terminal):",
  "serve.stop": "Press Ctrl+C to stop.",
  "serve.exposed": "warning: bound to {host}; anyone who can reach this address can use your Ollama. Set --api-key.",

  "doctor.title": "doctor: Ollama {url}, model {model}",
  "doctor.col.n": "#",
  "doctor.col.check": "Check",
  "doctor.col.result": "Result",
  "doctor.col.details": "Details",
  "doctor.check.1": "Ollama reachable, version",
  "doctor.check.2": "Model exists, scoring method",
  "doctor.check.3": "logprobs in responses",
  "doctor.check.4": "Relevant beats irrelevant (EN, KO)",
  "doctor.check.5": "yes/no tokens in top-20",
  "doctor.check.6": "Latency estimate",
  "doctor.skipped": "skipped because an earlier check failed",
  "doctor.d.version": "version {version} (needs >= {min})",
  "doctor.d.modelLogprobs": "family {family}, capabilities {caps} -> logprobs scoring",
  "doctor.d.modelEmbedding": "family {family}, capabilities {caps} -> embedding model, cosine scoring will be used",
  "doctor.d.modelMissing": 'model "{model}" not found in Ollama',
  "doctor.d.notNeededEmbedding": "not needed for cosine scoring",
  "doctor.d.noLogprobs": "logprobs not supported (needs Ollama >= 0.12.11)",
  "doctor.d.generateFailed": "call failed: {error}",
  "doctor.d.logprobsOk": "logprobs present (first token: {first})",
  "doctor.d.direction": "scores relevant > irrelevant: {scores}",
  "doctor.d.noYesNo": "{n} of {total} calls had no yes/no token in the top-20 (first token: {first})",
  "doctor.d.yesNo": "variants seen: {variants}; lowercase-only reading would be blind for {blind} of {total} calls",
  "doctor.d.latency": "about {ms} ms per pair; 20 documents at concurrency {c} = about {est} s (timeout {timeout} s)",
  "doctor.fix.version": "update Ollama to 0.12.11 or newer (https://ollama.com/download)",
  "doctor.fix.model": 'import or pull the model first (see "ollama list"); for a Qwen3-Reranker GGUF use a Modelfile with FROM ./<file>.gguf and TEMPLATE {{ .Prompt }}',
  "doctor.fix.generate": "check that the model loads in Ollama (ollama run <model>) and read the Ollama server log",
  "doctor.fix.direction": "the model does not behave like a reranker here; use a Qwen3-Reranker GGUF, or an embedding model for cosine scoring",
  "doctor.fix.yesno": "the model does not answer yes/no for the reranker prompt; use a Qwen3-Reranker model (not a chat model) imported with TEMPLATE {{ .Prompt }}",
  "doctor.fix.slow": "raise --timeout, lower --max-chars, or use a smaller model",
  "doctor.fixLine": "fix [{n}]: {text}",
  "doctor.nativeRerank": "note: this Ollama already answers on /api/rerank; the bridge is still useful for the /v1/rerank formats and eval.",
  "doctor.unreachable": "{error}",
  "doctor.summaryOk": "All checks passed.",
  "doctor.summaryFail": "{n} check(s) failed.",

  "eval.title": "eval: model {model}, k={k}, {queries} queries, {docs} documents",
  "eval.col.method": "Method",
  "eval.col.ms": "Time (ms)",
  "eval.m.original": "original order",
  "eval.m.embedding": "embedding cosine",
  "eval.m.naive": "naive lowercase logprobs",
  "eval.m.bridge": "bridge logprobs",
  "eval.note.same": "naive and bridge use the same Ollama answers (so one shared time); naive reads only the exact tokens yes/no.",
  "eval.note.mock": "These numbers come from the practice mock, not a real model. Run with your own model to see real quality.",
  "eval.note.real": "Numbers depend on your model, hardware and data.",
} as const;
