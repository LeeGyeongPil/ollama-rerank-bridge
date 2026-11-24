# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-24

### Added
- `serve`: `POST /v1/rerank`, `/v2/rerank` and `/rerank` accepting Cohere v1/v2, Jina, vLLM and TEI request shapes, descending scores, `GET /health`.
- Scoring from Ollama `/api/generate` logprobs using the Qwen3-Reranker model-card prompt; yes/no variants (case, leading space) are summed; embedding (cosine) scoring for embedding models.
- Safety options: `--concurrency`, `--timeout`, `--max-chars`, `--max-docs`, `--fallback-embed`, `--alias`, `--api-key`, default bind `127.0.0.1`.
- `doctor`: six checks (version, model, logprobs, direction, yes/no tokens, latency) with fix hints and exit codes 0/2/3.
- `eval`: nDCG@k and MRR for original order, embedding cosine, naive lowercase logprobs and bridge logprobs; bundled sample data.
- `--mock` practice mode with four fake-Ollama scenarios (`healthy`, `old-ollama`, `no-yesno`, `slow`).
- English and Korean screens (`--lang`, `OLLAMA_RERANK_BRIDGE_LANG`, `LC_ALL`/`LC_MESSAGES`/`LANG`).
