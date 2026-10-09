# Phase 7: typed AI patches, working drafts, and accepted revisions

Status: implemented locally on 2026-09-29; Postgres and AI Gateway provider verification remains pending.

## Delivered contract

The authoring protocol adds five internal operations without changing Story Language V5:

- `set-property` and `remove-property` operate only on an existing, unprotected
  property of one exact stable ID and require the current value as a precondition.
- `insert-child` operates only on `frames` or `flow`, requires an exact insertion
  anchor (or explicit append), and requires a new stable ID and existing V5 type.
- `remove-child` requires exact parent, collection, stable ID, and full current child
  value as a precondition.
- `move-child` requires exact parent, collection, stable ID, current index, and
  destination anchor.

Root identity/version, element IDs/types, authoring capability, production metadata,
release metadata, arbitrary paths, prototype keys, unknown properties, and unrestricted
JSON Patch are not model-writable.

The bounded assistant also exposes `generate_image` for explicit artwork requests.
It creates at most one image per assistant response through the configured OpenAI
image model, inspects and normalizes the returned bytes through the draft asset
pipeline, stores the result privately with `ai-generated` provenance, and returns an
approved logical path. Placement still uses the ordinary V5 `Image` Frame and typed
patch operations; image generation does not add a Story Language type or bypass
working-draft acceptance.

`applyAuthoringOperations` clones its input and either returns the complete proposed
document plus structural diffs or fails without mutation. It rejects unresolved or
ambiguous IDs, stale values/indices/anchors, duplicates, protected properties,
unsupported collections, and batches outside 1–24 operations.

`propose_patch` is available only inside the bounded server agent. Application code:

1. locks the generation and workspace head;
2. verifies the proposal's exact immutable base revision;
3. applies mandatory preconditions;
4. runs the canonical V5 parser and semantic validator;
5. verifies every referenced asset against the base manifest or approved workspace assets;
6. writes the validated document, manifest, diagnostics, operations, explanation,
   and diff into the workspace's mutable working draft;
7. leaves the accepted revision head unchanged and clears preview acknowledgement;
8. records attribution in the audit log.

One generation can apply at most one working-draft batch. Later conversation turns
accumulate on that same draft. A stale head, failed operation, invalid V5 document,
missing asset, inactive workspace, or repeated proposal changes neither the draft nor
revision history. Accepting all pending changes creates one immutable revision;
discarding restores the working draft from the accepted head.

The editor exposes the working preview plus explicit Accept and Discard actions.
Preview acknowledgement and publishing are blocked while pending changes remain.

An approval-gated Publisher mode may additionally let an authorized publisher ask
the assistant to call `request_publish_approval` for the exact current revision.
This records the request and exposes the review URL; it does not acknowledge preview
or perform the production commit. The existing authenticated, conflict-checked
commit endpoint remains the only production writer.

## Remaining provider evidence

- Apply migration `0004`, including the one-revision-per-generation constraint, on
  an isolated Postgres branch.
- Exercise concurrent proposals, head changes, restoration, and rebase transactions.
- Run live malformed-tool, provider retry, cancellation-during-proposal, and
  idempotent-generation scenarios through AI Gateway.
