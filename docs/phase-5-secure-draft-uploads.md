# Phase 5: secure draft uploads

Status: implemented locally on 2026-09-29; Postgres and private Vercel Blob provider verification remains pending.

## Delivered contract

- `0003_draft_assets.sql` persists one-use upload grants, approved assets, provenance,
  scan status, and exact revision-to-asset bindings.
- `POST /api/workspaces/:id/uploads/prepare` authorizes `story:edit`, reserves a
  collision-free logical path, and returns an exact-path, ten-minute private Blob
  client token constrained by MIME type and 25 MiB maximum size.
- Browser uploads land under a workspace quarantine prefix. The browser never
  receives the production Blob credential.
- `POST /api/workspaces/:id/uploads/complete` atomically claims the grant, reads the
  private object, verifies its declared format from decoded bytes, enforces dimension
  and pixel limits, strips raster metadata by decoding/re-encoding, rejects active or
  externally-referencing SVG, and writes an immutable approved private object.
- Approved assets are listed and delivered only through workspace-authorized routes.
  Responses are private, non-cacheable, `nosniff`, and sandboxed.
- Exact revision previews resolve uploaded assets through `revision_assets`; base
  production assets continue to resolve from the immutable base release.
- Promotion reads only approved assets bound to the revision, verifies manifest
  digest/type agreement, and writes them to the immutable public release before the
  public `story.json` commit point.
- `db:cleanup-draft-assets` expires abandoned quarantine grants and retires
  unreferenced assets only for committed/closed workspaces after the explicitly
  configured `DRAFT_ASSET_RETENTION_DAYS` period.

## Configuration

`DRAFT_BLOB_READ_WRITE_TOKEN` must identify a private Vercel Blob store separate
from the public production store used by `BLOB_READ_WRITE_TOKEN`.

`DRAFT_ASSET_RETENTION_DAYS` is required by the cleanup command. It intentionally has
no implicit default because retention remains an operator policy decision.

## Limits

- 25 MiB normalized bytes per image
- 16,384 pixels on either axis
- 80 million decoded pixels
- 128 active approved assets per workspace
- PNG, JPEG, WebP, AVIF, and inert SVG

The first release accepts user uploads only. It does not expose image generation to
an AI model, and uploaded assets do not become public unless an acknowledged revision
that references them is successfully promoted.

## Remaining provider evidence

- Apply migration `0003` to an isolated Postgres branch and exercise concurrent
  grant completion.
- Provision a private Blob store and verify client-token upload, private reads,
  cross-store promotion, expiration, and cleanup against the provider.
- Record the production retention value and organization-level byte/count quotas.
