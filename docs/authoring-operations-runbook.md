# Browser authoring operations runbook

## Short-lived revision sharing

An authorized publisher can create an expiring share for an exact workspace
revision with `POST /api/workspaces/:workspaceId/revisions/:revisionId/shares`.
The JSON body may contain `lifetimeSeconds`; the accepted range is 60 seconds to
24 hours and the default is 30 minutes. The returned `/share#token` URL is a
bearer secret and must not be stored in story content. Its fragment is deliberately
kept out of HTTP requests, referrer data, and platform request-path logs.

Opening the link exchanges the raw token in a same-origin request body for a Secure,
HttpOnly, SameSite=Lax cookie, clears the fragment, and navigates to
`/s/:storyId/shared/:grantId`. Package requests remain
same-origin, are authorized independently, and return `private, no-store`.
Only the SHA-256 token digest is persisted. A publisher can revoke a grant with
`DELETE /api/shares/:grantId`; expiry and revocation take effect on the next
document or asset request.

Shares expose the selected immutable revision. They do not make an already
public production package private: a story present in the public repository or
public Blob store remains independently downloadable and must be migrated or
removed separately before it can be treated as confidential.

This runbook covers browser authoring incidents. The continuous reader and the
legacy VS Code publisher remain separate surfaces.

## Immediate containment

Set only the narrowest required environment switch, redeploy, and record the actor,
reason, start time and incident ID:

- `SCROLLTASTIC_KILL_AI=true` stops new AI generations.
- `SCROLLTASTIC_KILL_UPLOADS=true` stops upload grants and completion.
- `SCROLLTASTIC_KILL_COMMITS=true` stops browser production promotion.
- `SCROLLTASTIC_KILL_AUTHORING=true` stops all authenticated draft access.

The checks run inside server authorization. Hiding browser controls is not relied on
for containment. Existing reader traffic is unaffected.

## Controlled rollout

The optional comma-separated allow-lists are intersected. When a list is configured,
the request must match it:

- `SCROLLTASTIC_AUTHORING_ACCOUNT_IDS`
- `SCROLLTASTIC_AUTHORING_STORY_IDS`
- `SCROLLTASTIC_AUTHORING_ORGANIZATION_IDS`

Roll out in this order: one internal story and owner, selected owners, selected
organizations, then remove allow-lists for general eligibility. Keep quotas at their
lowest useful values during each expansion. Test every kill switch after environment
promotion.

## AI usage anomaly

1. Set `SCROLLTASTIC_KILL_AI=true` if spend or request volume is still increasing.
2. Inspect generations, reservations, usage ledger and provider generation IDs. Do
   not copy prompts, credentials or story content into incident channels.
3. Run `npm run db:reconcile-generations`; it uses a lease and a bounded batch.
4. Compare active reservations with pending/running generations. Investigate before
   editing ledger rows. Preserve the audit trail.
5. Correct model/rate/token/cost settings, verify with an internal account, then
   remove the switch.

## Commit or storage divergence

1. Set `SCROLLTASTIC_KILL_COMMITS=true`.
2. Identify the story, workspace, attempt, expected ETag and current Blob ETag.
3. Run `npm run db:reconcile-commits`. It finalizes only attempts whose immutable
   release and stable `story.json` prove that promotion completed.
4. If stable `story.json` did not change, mark the attempt failed only after checking
   the immutable prefix. If it changed, never overwrite it blindly.
5. Restore a prior release by preparing its immutable manifest as a new reviewed
   workspace revision and using the normal preview acknowledgement and conditional
   promotion path. This creates a new attributable head; do not mutate release rows.

## Upload quarantine or cleanup backlog

1. Set `SCROLLTASTIC_KILL_UPLOADS=true` if unsafe or unexpected objects are arriving.
2. Inspect expired grants, inspecting grants, approved assets, revision references
   and `maintenance_failures`.
3. Run `npm run db:cleanup-draft-assets`. It is leased, bounded, and will not retire
   an asset referenced by a revision.
4. Resolve storage failures, rerun one batch, and mark dead-letter rows resolved only
   after verifying the object/database state.

## Account removal and retention

Disable the account before removing memberships or sessions. Close active workspaces,
cancel/reconcile generations, expire grants, and remove organization/story
memberships. Preserve attributable releases, audit events and financial usage records
according to policy; pseudonymize identity fields when deletion policy requires it.
Never cascade-delete production releases or audit history.

Draft asset retention is controlled by `DRAFT_ASSET_RETENTION_DAYS`. Session lifetime,
generation/message retention and audit retention require an approved deployment
policy before automated deletion is enabled.

## Recovery verification

After any incident, verify: public reader load; unauthorized draft denial; internal
editor load; exact preview acknowledgement; one deliberately conflicting commit;
generation reservation reconciliation; upload quarantine cleanup; structured logs
without prompt/session/token content; and every kill switch independently.
