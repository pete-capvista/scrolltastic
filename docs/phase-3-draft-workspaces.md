# Phase 3 draft workspaces

Status: implementation complete; provider integration verification pending, 2026-09-28.

Implemented in the first vertical slice:

- relational `draft_workspaces`, immutable `draft_revisions`, and `commit_attempts`;
- one active workspace per story/owner, guarded under a transaction advisory lock;
- D0 creation from the inventoried production release and current Blob document;
- canonical validation and SHA-256 digesting through the production V5 validator;
- authenticated create/resume and workspace-read APIs;
- private, no-store delivery of an exact revision document;
- immutable revision history and restore-as-new-head with acknowledgement clearing;
- exact package asset delivery from the immutable base release, never the mutable
  production package;
- browser preview routes using the production renderer at
  `/s/:storyId/edit/:workspaceId/r/:revisionId`;
- preview acknowledgement only for the current active revision;
- pure commit precondition evaluation for workspace state, head, acknowledgement,
  validation, and production ETag;
- durable commit attempts, immutable release creation, assets-first promotion,
  conditional `story.json` replacement, conflict state, and release/audit finalization;
- audit events for workspace creation and preview acknowledgement.
- an environment-gated deterministic title mutation for exercising revision creation
  and semantic diff (`SCROLLTASTIC_ENABLE_TEST_MUTATIONS=true`); it is not a product
  editing API and must remain disabled in production.
- an Edit affordance gated by the capability endpoint; it creates/resumes the
  workspace and navigates to its exact current-revision preview.
- strict trusted-origin enforcement on every browser authoring mutation.
- conservative rebase that replays only recorded deterministic operations onto the
  newest inventoried production release and rejects unsupported history;
- `npm run db:reconcile-commits` recovery for attempts where the conditional Blob
  commit succeeded but database finalization did not. It finalizes only when the live
  document digest exactly matches the attempted immutable revision.

The D0 logical manifest reuses inventoried production assets and replaces only the
`story.json` manifest entry with the canonical validated draft bytes. Draft assets
remain out of scope until Phase 5.

Remaining deployment verification:

- real provider integration tests for storage/database failure boundaries.

Do not deploy the Phase 3 routes until migrations 0001 and 0002 have been applied and
the Phase 2 production inventory import has completed for the target story.
