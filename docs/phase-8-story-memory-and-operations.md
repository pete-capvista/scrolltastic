# Phase 8: story memory and operational controls

Implemented on 2026-09-29. Deployment verification remains pending until the
Postgres migration, private draft storage, identity provider and configured AI
provider are available together.

## Delivered

- Reviewed story memory with `canon`, `style`, `arc` and `derived` categories,
  structured values, evidence, reasons, confidence, stable-ID scope and revision
  provenance.
- Independent proposal, approval and rejection flows. No proposal is promoted
  automatically and memory review does not create or commit a story revision.
- Bounded deterministic retrieval of approved memory only. Every entry supplied to
  a generation is recorded in `generation_memory` and included in the generation's
  context digest.
- Automatic invalidation of revision-derived proposed or approved entries when a
  workspace moves away from their source revision.
- A bounded `propose_memory_update` AI tool that creates reviewable proposals only.
- Publisher-facing memory review and operations APIs, plus lazy controls in the
  editor so read-only/editor users do not receive expanded authority.
- Operational summaries for memberships, usage/cost, generation status, draft
  storage, memory review, audit history and unresolved maintenance failures.
- Structured generation and maintenance events containing IDs, outcomes, counts
  and durations, but never prompts, story content, credentials or asset bytes.
- Leased, bounded, retry-safe generation reconciliation and draft-asset cleanup.
  Per-item failures are retained for dead-letter visibility rather than stopping a
  whole batch.

## Deployment settings

`SCROLLTASTIC_AI_MEMORY_CONTEXT_CHARS` sets the strict serialized memory context
budget and defaults to 8,000 characters. Existing hard generation, concurrency,
token, upload and retention settings remain authoritative. Run migration `0005`
before enabling memory endpoints or the updated maintenance jobs.

This phase adds server-side authoring protocols only. It does not change the V5
Story Language or reader semantics.
