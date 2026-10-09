# Phase 2 authorization and release inventory

Status: implementation complete; deployment provisioning and production import pending.

This phase replaces authorization embedded in individual routes with one action-based
policy. It adds browser session primitives, OIDC token exchange, PostgreSQL-backed
story memberships, a capability endpoint, production inventory migrations, an import
tool, and compatibility for the existing VS Code GitHub publisher.

## Security boundary

`authoring.ai.enabled` is public package data and never grants an action. The
capability response reports `authoring.canEdit: true` only when the current production
document declares authoring and the authenticated active account has an editor,
publisher, or owner membership for that exact story. AI prompting is reported
separately as `authoring.ai.canPrompt`, so the AI kill switch does not hide ordinary
editing.

The legacy `SCROLLTASTIC_PUBLISHERS` allow-list retains only `story:publish`. It does
not grant draft reads, browser editing, uploads, prompts, memory access, or membership
management. Remove the fallback after every existing publisher/story relationship is
represented in `story_memberships`.

Browser sessions are signed, expiring, `HttpOnly`, `Secure`, and `SameSite=Lax`.
Cookie-authenticated mutations must call `requireTrustedMutationOrigin`; bearer-only
VS Code publishing retains its existing token boundary. Session exchange validates an
OIDC ID token against a configured issuer, audience, and remote JWKS before upserting
an internal account.

## Required configuration

```text
DATABASE_URL
SCROLLTASTIC_APP_ORIGIN
SCROLLTASTIC_SESSION_SECRET        # independently generated, at least 32 characters
```

Nostr is the primary browser identity and needs no provider credential. Optional OIDC
fallback additionally requires `SCROLLTASTIC_OIDC_ISSUER`,
`SCROLLTASTIC_OIDC_AUDIENCE`, and `SCROLLTASTIC_OIDC_JWKS_URL`.

Existing publishing still requires `BLOB_READ_WRITE_TOKEN`,
`SCROLLTASTIC_PUBLISH_SECRET`, and, during migration, `SCROLLTASTIC_PUBLISHERS`.
Provider credentials and tokens are server-only.

## Deployment order

1. Create a dedicated PostgreSQL database/branch for the target environment.
2. Set the required environment variables without copying production credentials to
   Preview or local environments.
3. Run `npm run db:migrate` against that database.
4. Generate a stable organization UUID and import each existing live story explicitly:

   ```sh
   npm run db:import-production -- \
     --organization-id=<uuid-v4> \
     --organization-name=<name> \
   --owner-nostr=<64-character-hex-public-key> \
     --story-id=<story-uuid>
   ```

   The importer does not rewrite the stable production package. It builds a
   deterministic manifest, copies that exact package to a new immutable release,
   records the current ETag/digest,
   assigns the named Nostr account as owner, and writes an audit event. Reusing the
   same organization ID makes retries safe.
5. Verify `/api/stories/<story-id>/capabilities` anonymously, as a viewer, editor,
   publisher, owner, suspended account, and wrong-organization account.
6. Verify VS Code publishing through both the database membership and the temporary
   allow-list fallback.
   Successful commits return `inventoryRecorded`. When PostgreSQL is configured this
   should be `true`; `false` means the Blob commit succeeded but inventory was not
   configured. A logged reconciliation error means the package is live and the
   release row must be repaired from its immutable release prefix before continuing
   authoring rollout.
7. Remove migrated logins from `SCROLLTASTIC_PUBLISHERS`; remove the fallback code in
   a later compatibility cleanup after logs show no use.

## HTTP resources

- `POST /api/auth/session`: exchange a verified OIDC ID token for a browser session.
- `DELETE /api/auth/session`: clear the browser session; requires the trusted origin.
- `GET /api/stories/:id/capabilities`: return authenticated actions and the combined
  document/server AI edit decision; never cache publicly.

The Edit affordance is intentionally deferred until Phase 3 supplies a valid
workspace-creation destination. Exposing a button that leads to a nonexistent or
unsafe editing route would not satisfy the design. The Phase 2 endpoint is the sole
input that the Phase 3 reader shell will use to decide whether to show it.

## Remaining deployment decisions

- Nostr is the primary browser identity. OIDC remains an optional fallback adapter.
- Select the managed PostgreSQL provider and environment/branch topology.
- Define session lifetime and provider logout behaviour.
- Define operational ownership of migration, import, backup, and audit retention.

These choices do not alter the Story Language or the action/membership model.
