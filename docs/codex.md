# Codex build notes

## Atlas · session `01a1979b-eced-70f1-baeb-de1d085fe182`

**Asked:** Build the sourced Tower Bridge history and facts, a SurrealDB graph, and a validator that rejects numbers without evidence.

**Codex did:** Expanded the exhibit to 24 selectable parts, 14 sourced events covering every construction year from 1886 through 1894 and the earlier riverside, six people, six nearby places, and sourced engineering facts. Added a validator that rejects unsourced numbers, poison tests, and a parameterized SurrealDB graph with a validated JSON fallback. A live database run caught a `RELATE` syntax error that mocks missed; after fixing it, exact readback passed for Unicode, quotes, and colons. Reseeding is idempotent and removes stale parts.

**Commit:** `c0b7ed8` (`atlas-history-facts`). All 19 tests pass; live graph checks passed on SurrealDB 3.3.5.
