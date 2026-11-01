# Codex build notes

## Atlas · session `01a1979b-eced-70f1-baeb-de1d085fe182`

**Asked:** Build the sourced Tower Bridge history and facts, a SurrealDB graph, and a validator that rejects numbers without evidence.

**Codex did:** Expanded the exhibit to 24 selectable parts, 14 sourced events covering every construction year from 1886 through 1894 and the earlier riverside, six people, six nearby places, and sourced engineering facts. Added a validator that rejects unsourced numbers, poison tests, and a parameterized SurrealDB graph with a validated JSON fallback. A live database run caught a `RELATE` syntax error that mocks missed; after fixing it, exact readback passed for Unicode, quotes, and colons. Reseeding is idempotent and removes stale parts.

**Commit:** `c0b7ed8` (`atlas-history-facts`). All 19 tests pass; live graph checks passed on SurrealDB 3.3.5.

## Prometheus · session `01a1979b-bcae-7e32-900c-2eff2db3ddbb`

**Asked:** Build the source-citing docent and semantic search, benchmark the available models, and stream answers quickly.

**Codex did:** Built JSON and SSE answers with a four-fact retrieval limit, exact source citation chips, refusal paths, and numeric checks before streaming a clause. The first live benchmark exposed two real bugs: models confused part IDs with source IDs, and “open” missed the “Opened” event. Codex fixed both, separated fact IDs from citations, and handled citations placed after sentence punctuation. Two parallel builders implemented the docent grounding and a startup-cached OpenAI embedding index while the main session integrated the graph and existing routers. The prompt contract adapts Mechanica's MIT-licensed docent. API, graph and existing router tests passed together.

**Commits:** `a986ee5` (docent and semantic search), `f1a1e2f` (graph retrieval and streaming safeguards), `e69f682` (sourced people and engineering facts within the four-fact budget). Atlas connected the browser chat to the stream in `bc3a19b`, with tests for split Unicode, final refusals, and interrupted streams.

**Model timing:** Listed models with the provided key and timed the same three questions about tower height, opening date and bascule motion on the original sourced scaffold. No Flash model was listed. Final validation checked the saved outputs for source IDs and numeric provenance.

| Model | Correctly cited answers | Median first token | Median full response |
| --- | --- | --- | --- |
| gpt-6.1-sol | 3/3 | 1.438 s | 1.733 s |
| gpt-6.1-terra | 3/3 | 0.783 s | 1.198 s |
| gpt-6-luna | 3/3 | 1.142 s | 1.285 s |
| gpt-4.1-mini | 1/3 | 0.679 s | 1.306 s |
| gpt-4.1-nano | unavailable (404) | — | — |
| gpt-4o-mini | 3/3 | 0.775 s | 1.295 s |
| gpt-5.4-mini | 3/3 | 0.607 s | 0.733 s |
| **gpt-5.4-nano** | **3/3** | **0.421 s** | **0.715 s** |

Selected `gpt-5.4-nano`, overridable with `OPENAI_DOCENT_MODEL`. A separate run through the actual citation-checking stream emitted its first validated text in 1.414 s, 0.776 s and 0.753 s (median 0.776 s). Cold requests can exceed one second; these small measurements are not a latency guarantee for the expanded corpus or deployed service.

**Latency follow-up:** Parallel builders reused one app-lifetime OpenAI client for embeddings and docent answers. A bounded startup inference moves model warm-up ahead of the first visitor request; failure still permits startup, and shutdown closes the shared connection. On the same original scaffold, the three citation-checked answers then began in **0.557 s, 0.534 s and 0.492 s** (median **0.534 s**). Startup warm-up took 3.384 s. The integrated suite passed 61 tests, including shared-client ownership, cleanup, routing and warm-up failure. These timings are a small sample, not a service-level guarantee.
