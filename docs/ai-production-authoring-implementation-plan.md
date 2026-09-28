# AI production authoring implementation plan

Status: approved for phased implementation, 2026-09-28.

Source design: [AI production authoring](ai-production-authoring-design.md).
Language contract: [Scrolltastic Story Language V5](../scrolltastic_story_language_v5.md),
especially section 47. Publishing baseline:
[Blob publishing workflow](blob-publishing-workflow.md).

The proposed Story Language extension and recommended architecture were approved on
2026-09-28. Provider-specific selections, exact quotas, and retention values remain
deployment decisions that must be recorded before their dependent phases begin.

## 1. Outcome and delivery rule

Deliver a browser authoring workspace in which an authorized editor can branch from
the current production release, converse with an AI assistant, upload artwork, create
validated immutable draft revisions, preview the exact candidate package, and have a
publisher atomically promote that reviewed revision. No AI code path receives a
production commit capability.

Work in vertical, releasable slices. The first useful slice is deliberately non-AI:
an authenticated editor can create, edit through a deterministic test operation,
preview, acknowledge, and commit a draft. AI is added only after that safety path is
proven end to end.

The following invariants apply to every phase:

- V5 JSON remains the authored product language; authoring protocols are not Story
  Language properties.
- The canonical parser and semantic validator gate every revision and commit.
- Draft revisions, generation records, usage entries, releases, and audit events are
  durable and attributable.
- Authorization is checked inside every application service, not only in UI/routes.
- Production uses compare-and-swap against the workspace base ETag; no browser force
  path exists.
- Assets are promoted before `story.json`; the document write remains the reader's
  commit point.
- Preview acknowledgement names one immutable revision and is invalidated whenever
  the current revision changes.
- Continuous scrolling, semantic reading order, Beats, reduced motion, and existing
  renderer behaviour remain unchanged in production and preview.

## 2. Current baseline and gaps

### Already reusable

- A strict V5 JSON Schema, generated TypeScript types and generated AJV validator.
- Semantic validation with categorized, path-aware diagnostics.
- A framework-independent renderer with stable `data-panel-id` and `data-frame-id`
  hooks suitable for external selection overlays.
- Configurable package roots and a production reader at `/s/:storyId`.
- Public Vercel Blob packages, immutable `_releases` copies, staging prefixes,
  digest/size/path checks, conditional `story.json` writes, and release ETags.
- GitHub-authenticated VS Code publishing with a server-owned allow-list.
- Unit, browser, schema, renderer, navigation, publishing, and extension tests.

### Missing

- Browser account sessions, organizations, memberships, roles, and policy services.
- A relational database, migrations, repositories, and transactional invariants.
- First-class database records for existing production releases.
- Protected draft storage and authorized draft asset delivery.
- Workspaces, immutable revisions, preview acknowledgement, rebase, and rollback UI.
- An editor application shell, outline, selection bridge, semantic diff, and history.
- Secure upload inspection/quarantine and asset provenance.
- Persisted conversations, generations, tool calls, resumable status, and usage ledger.
- AI orchestration, bounded authoring tools, story memory, and administrative limits.

### Baseline verification

On 2026-09-28, `npm test` passes 75 tests in seven files, `npm run build` passes
generated-artifact checks, TypeScript checking and the Vite production build, and
`npm run typecheck:vscode` passes. The missing declarations for the VS Code archive
and downloader CommonJS modules were added before feature work to lock a green
baseline.

## 3. Phase 0: decisions and executable contracts

Resolve these decisions in one short architecture decision record. Do not begin the
schema migration or provision production services until it is accepted.

| Decision | Recommended initial choice | Consequence |
| --- | --- | --- |
| Story capability | Approve optional `authoring.ai.enabled` | Requires a coordinated V5 spec/schema/type/fixture/test update. It grants no authority. |
| Browser identity | Choose a hosted OIDC provider; keep a provider-neutral `IdentityAdapter` | The present project is Vite plus Vercel Functions, so do not adopt a Next.js-only auth integration or migrate frameworks merely for auth. |
| Tenancy | One default organization, explicit story memberships, roles `viewer/editor/publisher/owner` | Existing approved GitHub publishers are migrated to owners or publishers explicitly. |
| Relational store | Managed Postgres with transactional migrations; use a small typed query layer | Transactions enforce reservations, revision ancestry, membership, and commit state. Do not encode these only in Blob metadata. |
| Object storage | Retain the public production Blob store; use a separate private store, or a private namespace with authenticated delivery, for drafts | Public production URLs stay stable. Draft authorization never depends on an unguessable pathname. |
| AI routing | One server-side AI gateway account with an allow-listed model policy | Provider keys and failover remain centralized; model IDs are configuration, not authored JSON. |
| First-release media | User uploads only; no AI image generation | Reduces provenance, safety, persistence, and cost scope. |
| Reader affordance | Hide Edit from anonymous users initially | Ordinary reading receives no authoring chrome. |
| Retention | Define periods for abandoned uploads/workspaces, conversations, audit records, and deleted accounts | Cleanup jobs can be implemented and tested before real user content accumulates. |
| Limits | Define per-plan hard values for RPM, concurrency, input/output tokens, spend, upload bytes/count, storage, and workspaces | Budget reservation can fail closed before model invocation. |

Phase 0 deliverables:

1. Update the design's status and add ADRs for identity, database, storage, AI gateway,
   retention, and initial quotas.
2. Define API conventions: opaque IDs, UTC timestamps, idempotency keys, cursors,
   stable error envelopes, request IDs, CSRF/origin policy, and optimistic concurrency.
3. Define state machines for workspace, revision, generation, asset, usage reservation,
   and commit attempt. List every allowed transition and terminal failure state.
4. Define a permission matrix by application action, not just by page.
5. Define service-level interfaces so domain tests do not need Postgres, Blob, an
   identity provider, or an LLM.

Exit criteria: every item in the original design's “Decisions required before
implementation” is resolved; the threat model and data-retention policy are reviewed;
all existing unit tests and `npm run build` are green.

## 4. Target architecture and source layout

Keep the current Vite reader and narrow GSAP animation layer. Add an editor entry
point and server-side application services without moving domain rules into HTTP
handlers, database repositories, or AI SDK callbacks.

```text
Browser reader/editor
  -> HTTP route adapters
      -> authentication + authorization policy
      -> application services
          -> Postgres repositories
          -> package/revision service -> validator
          -> object-store adapter
          -> promotion service
          -> AI orchestration -> typed tools -> application services
          -> usage + audit services
```

Suggested additions (adapt names to the selected libraries):

```text
src/
  authoring/
    model/             domain records, states, permissions, operation types
    application/       workspace, revision, preview, commit, upload services
    patch/             pointer resolution, preconditions, protected paths, apply
    diff/              structural/document/asset diffs
    selection/         outline and renderer selection bridge
    client/            editor shell and API client
  auth/                identity adapter, session parsing, policy checks
  persistence/         repository interfaces and Postgres implementations
  storage/             production/draft object-store interfaces
  ai/                  context builder, tools, agent, stream persistence
  memory/              memory approval and retrieval
  usage/               limits, reservations, reconciliation, costing
api/
  stories/[id]/...
  workspaces/[id]/...
  generations/[id].ts
  auth/...
db/
  migrations/
  schema/
```

Extract reusable package validation and promotion functions from `api/publish` into
application modules. Keep the existing routes as adapters during migration so VS
Code publishing does not fork validation or release semantics.

### Required service boundaries

- `IdentityService`: validates browser sessions or GitHub bearer identity and returns
  an internal principal.
- `AuthorizationService`: evaluates organization/story membership and action.
- `PackageValidator`: canonical syntax, semantics, identity, references, manifest,
  and asset-completeness validation.
- `WorkspaceService`: create/resume/close workspaces and select current revisions.
- `RevisionService`: create immutable validated revisions and restore via a new head.
- `PatchService`: apply only typed, preconditioned operations to an exact base.
- `AssetService`: prepare, inspect, quarantine, approve, deliver, and retire assets.
- `PreviewService`: resolve exact immutable draft bytes and acknowledge a revision.
- `PromotionService`: transactionally check policy/state/ETag, copy release, promote
  assets, conditionally write `story.json`, and record result.
- `GenerationService`: preallocate, invoke, stream/persist, execute bounded tools,
  reconcile usage, and finalize every model call.
- `MemoryService`: propose, review, retrieve, record use, and invalidate entries.
- `AuditService`: append security-meaningful events with redaction.

## 5. Data model and migrations

Introduce migrations incrementally. Use database constraints for invariants that
must survive concurrent requests.

### Migration A: identity and production inventory

- `accounts(id, identity_provider, provider_subject, status, created_at, ...)`
- `organizations(id, name, status, plan_id, created_at, ...)`
- `organization_memberships(organization_id, account_id, role, ...)`
- `stories(id, organization_id, production_release_id, production_etag, status, ...)`
- `story_memberships(story_id, account_id, role, ...)`
- `production_releases(id, story_id, parent_id, etag, manifest_json, document_digest,
  storage_prefix, actor_id, created_at)`
- `audit_events(id, organization_id, actor_id, action, target_type, target_id,
  request_id, metadata_json, created_at)`

Backfill existing Blob stories and `_releases` into inventory without rewriting
their public packages. Reconcile Blob heads before marking the import complete.

### Migration B: drafts and assets

- `draft_workspaces(id, story_id, base_release_id, base_etag, owner_id, current_revision_id,
  preview_acknowledged_revision_id, status, created_at, updated_at)`
- `draft_revisions(id, workspace_id, parent_id, generation_id, manifest_json,
  document_digest, validation_json, operations_json, storage_prefix, created_by,
  created_at)`
- `assets(id, organization_id, digest, media_type, bytes, width, height, logical_path,
  storage_key, scan_status, provenance, uploader_id, created_at)`
- `revision_assets(revision_id, asset_id, logical_path)`
- `idempotency_keys(principal_id, scope, key, request_digest, response_json,
  status, expires_at)`

Enforce one current revision per workspace, revision ownership by workspace, and a
preview acknowledgement that can only reference that workspace. Current-head changes
and acknowledgement clearing occur in one transaction.

### Migration C: conversations, generations, and usage

- `conversations(id, workspace_id, created_by, status, created_at)`
- `messages(id, conversation_id, sequence, role, parts_json, generation_id, created_at)`
- `generations(id, workspace_id, conversation_id, account_id, model, status,
  prompt_digest, context_digest, input_json, output_json, usage_json, estimated_cost,
  actual_cost, latency_ms, resulting_revision_id, error_code, created_at, completed_at)`
- `generation_memory(generation_id, memory_id)`
- `tool_calls(id, generation_id, sequence, tool_name, input_json, output_json,
  status, started_at, completed_at)`
- `usage_ledger(id, organization_id, account_id, generation_id, kind, units, cost,
  period_key, created_at)`
- `usage_reservations(id, generation_id, organization_id, reserved_units,
  reserved_cost, status, expires_at, reconciled_at)`

Allocate the generation ID and commit the pending record plus usage reservation
before calling the provider. Persist durable message/tool state during streaming,
then reconcile actual usage on success, cancellation, timeout, or provider error.

### Migration D: story memory

- `story_memory(id, story_id, category, value_json, provenance_json, confidence,
  status, scope_json, source_revision_id, created_by, reviewed_by, created_at,
  reviewed_at, invalidated_at)`

Only `approved` entries are eligible for prompt retrieval. Store the exact memory IDs
used by each generation.

## 6. Delivery phases

### Phase 1: language capability and green baseline (implemented 2026-09-28)

1. Fix the existing VS Code module declaration/typecheck failure.
2. If approved, add `authoring.ai.enabled` to the V5 specification and section 47.
3. Update `src/schema/story.schema.json`, regenerate types/validator, and add positive,
   default/absent, unknown-property, and wrong-type tests.
4. Add the flag to one non-production fixture and keep renderer output identical.
5. Expose the parsed capability to the host; do not render Edit yet.

Exit: spec, schema, generated artifacts, examples, and tests agree; existing stories
remain valid; the renderer has no AI dependency or visual regression.

### Phase 2: accounts, policy, and release inventory

1. Implement provider-neutral internal principals and secure HTTP-only browser sessions.
2. Add strict origin checks, CSRF protection for cookie mutations, session rotation,
   logout, safe return URLs, and authorization test helpers.
3. Implement organization/story membership and centralized action checks.
4. Import existing publishers and production releases; replace `requirePublisher`
   internally with the shared policy while retaining the VS Code GitHub adapter.
5. Add `/api/stories/:id/capabilities`; return only authorized actions.
6. Show Edit only when the V5 flag is true and `story:edit` is returned.

Exit: document flags never grant access; enumeration and cross-tenant access tests
fail closed; existing VS Code publishing still works.

### Phase 3: non-AI workspace, revision, preview, and promotion

1. Create or resume a workspace pinned to the exact production release and ETag.
2. Materialize an immutable D0 revision containing the complete package manifest.
3. Add one deterministic, internal test mutation path to prove revision creation;
   remove or keep it test-only before release.
4. Serve `/s/:storyId/edit/:workspaceId/r/:revisionId` from an authorized draft root
   using the same renderer and exact stored bytes.
5. Implement validation diagnostics, document/structural/asset diff, history, restore,
   and acknowledgement of the current exact revision.
6. Extract the production promoter from `api/publish/commit.ts`. Require permission,
   valid head, clean assets, matching acknowledgement, and matching base ETag.
7. Record release, workspace state, and audit events. If storage succeeds but the DB
   update fails, reconciliation must discover the Blob ETag/release and finalize or
   flag the attempt without repeating an unsafe write.
8. Add explicit conflict and rebase states; do not implement force commit.

Exit: an authorized publisher can complete the full safety path without AI; stale
ETags, changed heads, missing acknowledgements, and replayed idempotency keys behave
deterministically.

### Phase 4: editor shell and selection bridge

1. Add the durable editor route and responsive split/drawer layout suitable for
   portrait mobile and desktop.
2. Build an outline from parsed V5 structure with stable IDs and types.
3. Implement “Select in story” as an external overlay using renderer-owned data
   attributes. Account for transformed/animated bounds and refresh on scroll, resize,
   layout lifecycle, and revision changes.
4. Synchronize outline, overlay, and selected context without mutating authored JSON,
   DOM reading order, focus, or ScrollTrigger measurements.
5. Add accessible focus trapping for dialogs, keyboard selection controls, status
   announcements, and reduced-motion behaviour.

Exit: selection is exact and non-invasive across normal/overlay/overflow Frames,
Card FIT height changes, Mask transitions, mobile viewports, keyboard-only use, and
screen-reader navigation.

### Phase 5: secure draft uploads

1. Prepare a workspace/path/file-bound short-lived upload grant after authorization
   and quota reservation.
2. Upload to quarantine; verify size, magic bytes, decoded dimensions, digest, media
   type, and path. Strip raster metadata. Reject or sanitize active SVG content using
   an explicitly tested allow-list.
3. Mark assets approved only after inspection/scan. Serve draft assets through an
   authorized endpoint or short-lived signed URL with safe content headers.
4. Let revisions reference only approved workspace assets returned by `listAssets`.
5. On commit, promote only referenced assets before `story.json`; preserve provenance.
6. Garbage-collect expired grants, abandoned quarantine objects, and unreferenced
   draft assets according to retention policy.

Exit: polyglots, spoofed extensions, oversized dimensions, traversal, active SVG,
cross-workspace asset IDs, and expired grants are rejected; no draft asset is public.

### Phase 6: persisted conversation and read-only AI

1. Add addressable conversations and generation resources before starting any stream.
2. Build bounded authoring context from schema/rules, current revision, outline,
   selection, diagnostics, approved memory, and capability list. Treat all story and
   image content as untrusted data.
3. Implement read-only tools: `inspect_element`, `inspect_neighbourhood`,
   `list_assets`, and `ask_clarification`.
4. Use a server-owned typed agent/tool loop with maximum steps, input/output sizes,
   timeout, cancellation, and allowed-tool enforcement. The SDK transports structured
   calls; application services enforce domain rules.
5. Persist messages, generation status, tool calls, output, model, context/memory IDs,
   token usage, cost, latency, and errors. Reconnect by reading durable state rather
   than regenerating.
6. Atomically reserve budget before provider invocation and reconcile every terminal
   path. Never accept client-supplied usage.

Exit: the assistant can inspect and clarify but cannot mutate a draft; refreshing or
disconnecting loses no completed output or audit state; quota denial invokes no model.

### Phase 7: typed patch proposals and immutable AI revisions

1. Define a small discriminated operation union over V5 documents. Initial operations
   should cover tested property replacement/removal and child insertion/removal/move
   by stable ID, not arbitrary unrestricted JSON Patch from the model.
2. Compile operations to internal pointer-level changes with mandatory `test`
   preconditions against the exact `base_revision`.
3. Protect `storyLanguage`, root `id`, production metadata, server state, and any
   property outside the current V5 schema/capability set.
4. Resolve targets in order: selected ID, exact named ID, one unambiguous outline
   match, otherwise clarification. Insertion requires parent and relative position.
5. Apply to an immutable copy, parse and semantically validate, verify asset
   references, calculate diffs, and create a revision only when valid.
6. Store operation input, explanation, validation outcome, parent, generation ID,
   full manifest, and digest. Atomically move workspace head and clear preview ack.
7. Add refinement, undo/restore, cancellation, failure diagnostics, and concurrent
   head-change handling.

Exit: fuzz/property tests show patches cannot escape permitted paths; unresolved IDs,
failed preconditions, invalid V5, missing assets, and stale heads create no revision.
Every valid AI revision is reproducible from its recorded base and operations.

### Phase 8: story memory and operational controls

1. Add propose/review/edit/reject flows independent from story commit.
2. Retrieve only relevant approved entries within a strict context budget and record
   every supplied memory ID.
3. Invalidate derived entries when their source revision changes; never automatically
   promote proposed canon.
4. Add owner/publisher views for membership, limits, usage, costs, generation failures,
   audit events, storage, retention, and memory review.
5. Add cleanup/reconciliation jobs with leases, idempotency, bounded batches, metrics,
   and dead-letter visibility.

Exit: memory provenance and review are complete; hard limits stop overspend; cleanup
never deletes assets referenced by a live draft or release.

### Phase 9: hardening and controlled rollout

1. Run the full authorization matrix, IDOR, CSRF, session fixation, replay,
   prompt-injection, malformed tool call, patch-fuzzing, upload, concurrency, ETag,
   rollback, and recovery suites.
2. Verify CSP and security headers; redact secrets, credentials, raw sessions, and
   unnecessary prompt content from logs.
3. Load-test generation concurrency, revision creation, signed asset delivery, and
   commit contention. Exercise provider timeout/failover without model escalation.
4. Run accessibility checks plus real keyboard, screen-reader, reduced-motion, and
   physical mobile verification for reader and editor.
5. Deploy behind account and story feature flags: internal story, selected owners,
   selected organizations, then general eligibility. Define kill switches separately
   for AI calls, uploads, commits, and the editor entry point.
6. Document incident response, usage anomalies, restore/reconciliation, retention,
   account deletion, and rollback runbooks.

Exit: all design acceptance criteria have linked automated or manual evidence; the
non-AI reader and existing publisher meet their previous conformance checks.

## 7. API plan

All mutation routes require authentication, authorization, an idempotency key, strict
content type/size limits, schema validation, origin/CSRF protection as applicable, and
an audit event. Responses use opaque IDs and stable error codes.

```text
GET  /api/stories/:storyId/capabilities
POST /api/stories/:storyId/workspaces
GET  /api/workspaces/:workspaceId
GET  /api/workspaces/:workspaceId/revisions
GET  /api/workspaces/:workspaceId/revisions/:revisionId
POST /api/workspaces/:workspaceId/revisions/:revisionId/restore
POST /api/workspaces/:workspaceId/revisions/:revisionId/preview-ack
POST /api/workspaces/:workspaceId/rebase
POST /api/workspaces/:workspaceId/commit

POST /api/workspaces/:workspaceId/uploads/prepare
POST /api/workspaces/:workspaceId/uploads/complete
GET  /api/workspaces/:workspaceId/assets
GET  /api/workspaces/:workspaceId/assets/:assetId/content

POST /api/workspaces/:workspaceId/conversations
GET  /api/conversations/:conversationId/messages
POST /api/conversations/:conversationId/generations
GET  /api/generations/:generationId
POST /api/generations/:generationId/cancel

GET  /api/stories/:storyId/memory
POST /api/stories/:storyId/memory/proposals
POST /api/stories/:storyId/memory/:memoryId/review
```

Streaming is an optimization over durable generation state. A generation POST returns
its ID immediately; SSE may stream persisted events, while polling the generation and
messages remains a correct recovery path.

## 8. Test strategy and traceability

Add deterministic fakes for identity, clock, ID generation, object storage, AI model,
cost table, and repositories. Domain and application tests must run without network
access. Use a real temporary Postgres instance for migration/transaction tests and an
isolated storage prefix for integration tests.

Minimum suites:

- Schema: capability declaration and strict unknown-property behaviour.
- Policy: every role/action pair, disabled accounts, tenant boundaries, and document
  flag versus server permission.
- Revision: immutability, ancestry, head races, acknowledgement invalidation, restore,
  exact manifest/digest, and invalid-document rejection.
- Patch: operation schema, protected paths, ID resolution, preconditions, stale base,
  fuzzed paths/values, asset completeness, and deterministic replay.
- Promotion: assets-first ordering, conditional document write, partial failures,
  reconciliation, rollback, idempotency, and concurrent publishers.
- Upload: signatures, bytes, MIME, dimensions, metadata, SVG safety, quarantine,
  signed delivery, quotas, expiration, and garbage collection.
- Generation: pending record before call, reservations, step/output limits, durable
  streaming, reconnection, cancellation, timeout, provider failure, usage reconciliation,
  and prompt-injection attempts.
- Memory: approval boundary, scoped retrieval, source invalidation, context limits,
  and generation traceability.
- Browser: editor entry visibility, selection overlay, clarification, revision/diff,
  exact preview acknowledgement, commit conflict/rebase, responsive layout, keyboard,
  reduced motion, and reader regression.
- Operations: migration rollback, import reconciliation, cleanup races, retention,
  audit redaction, metrics/alerts, and kill switches.

Maintain a requirement-to-test table keyed to every acceptance criterion in the
design document. A phase is not complete until its relevant evidence is linked.

## 9. Observability and operational readiness

Record structured metrics for authentication failures, denied actions, workspaces,
revision validation outcomes, generation latency/status/token/cost, tool failures,
quota denials, upload scans, commit conflicts, promotion duration, reconciliation,
and cleanup. Correlate with request, workspace, generation, commit-attempt, and release
IDs; do not put story text, prompts, tokens, or credentials in metric labels.

Alert on budget reservation drift, unreconciled generations, stuck quarantines,
storage/DB divergence, repeated commit failures, unusual authorization denials, and
cleanup backlog. Dashboards must distinguish product failures from provider outages.

## 10. Recommended issue breakdown

Create epics matching Phases 0–9. Within each phase, keep pull requests narrow and
ordered as follows:

1. contracts/types and migration;
2. pure domain rules with tests;
3. repository/storage adapters and integration tests;
4. HTTP route adapters and authorization tests;
5. client UI and browser tests;
6. documentation, observability, and rollout evidence.

The first implementation milestone should comprise Phases 0–3 only. It proves the
language decision, shared account policy, immutable draft branch, exact preview, and
safe production promotion before AI, uploads, or memory add more failure modes.

## 11. Definition of done

The feature is production-ready only when:

- every acceptance criterion in the source design has evidence;
- the V5 specification, schema, generated types, fixtures, examples, and tests agree;
- the reader, VS Code publisher, and browser editor use one validation/promotion core;
- no route or service can infer authorization from `story.json`;
- every generation and usage reservation reaches a reconciled terminal state;
- every production release is attributable, immutable, conflict-safe, and rollbackable;
- draft bytes and assets are protected from unauthorized reads as well as writes;
- preview acknowledgement is enforced server-side for the exact committed revision;
- security, accessibility, mobile, recovery, retention, and operational runbooks are
  verified in the deployed environment.
