# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-11-25

### Fixed
- CI: move to `actions/checkout@v6` and `actions/setup-node@v6`, which run on the Node 24 action runtime (GitHub scheduled the removal of the Node 20 action runtime from hosted runners for 2026-09-23). Steps are now named and split, the npm cache is off, and a failure prints the Node/npm versions, the TypeScript native package and the npm debug log.
- `serve` with `--api-key` now prints a curl example that includes the `Authorization: Bearer <your key>` header, and shows `127.0.0.1` when bound to `0.0.0.0` or `::`. IPv6 hosts are shown in brackets.
- `eval --data` with a broken JSON file now says the line and column and shows the expected format; an empty file gets its own message.

## [0.1.1] - 2026-11-24

### Changed
- CI workflow hardened; added `.gitattributes` for consistent line endings.

## [0.1.0] - 2026-11-24

### Added
- `serve`: `POST /v1/rerank`, `/v2/rerank` and `/rerank` accepting Cohere v1/v2, Jina, vLLM and TEI request shapes, descending scores, `GET /health`.
- Scoring from Ollama `/api/generate` logprobs using the Qwen3-Reranker model-card prompt; yes/no variants (case, leading space) are summed; embedding (cosine) scoring for embedding models.
- Safety options: `--concurrency`, `--timeout`, `--max-chars`, `--max-docs`, `--fallback-embed`, `--alias`, `--api-key`, default bind `127.0.0.1`.
- `doctor`: six checks (version, model, logprobs, direction, yes/no tokens, latency) with fix hints and exit codes 0/2/3.
- `eval`: nDCG@k and MRR for original order, embedding cosine, naive lowercase logprobs and bridge logprobs; bundled sample data.
- `--mock` practice mode with four fake-Ollama scenarios (`healthy`, `old-ollama`, `no-yesno`, `slow`).
- English and Korean screens (`--lang`, `OLLAMA_RERANK_BRIDGE_LANG`, `LC_ALL`/`LC_MESSAGES`/`LANG`).
