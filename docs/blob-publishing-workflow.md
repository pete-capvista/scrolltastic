# Blob publishing workflow

**Status:** Implemented initial publishing contract

**Scope:** Publish a validated local Scrolltastic package from the VS Code
extension to Vercel Blob.

## Provisioned infrastructure

- Vercel project: `infitude-1682/scrolltastic`
- Blob store: `scrolltastic-stories` (`store_RMGZSjsMKcQAriw0`)
- Region: Sydney (`syd1`)
- Access: public read, authenticated write
- Public base URL: `https://rmgzsjsmkcqariw0.public.blob.vercel-storage.com/`
- `BLOB_READ_WRITE_TOKEN` is linked to Production, Preview and Development.

The current CLI pull also writes `VERCEL_OIDC_TOKEN` without a local
`BLOB_STORE_ID`. Until Vercel's local pull supplies the complete OIDC pair, local
Blob commands must explicitly select the read/write-token mode (or run outside the
directory after sourcing only `BLOB_READ_WRITE_TOKEN`). Deployed code should use the
project-provided credential resolution and must not hard-code either value.

Published stories are public content. The store's read access therefore matches the
reader's shareable `/s/<story-id>` model. Public read access does not imply public
write access: the Blob read/write credential remains server-only.

Production sets `VITE_STORY_ROOT` to the public Blob base URL. The existing fixtures
are migrated and production loading from Blob has been browser-verified. Local and
Preview builds retain `public/reader-config.json` as their fallback unless they are
given their own environment override.

## Security boundary

The VS Code extension MUST NOT receive or persist `BLOB_READ_WRITE_TOKEN`.

For the first publishing increment, the extension authenticates with VS Code's
built-in GitHub authentication provider:

```ts
vscode.authentication.getSession('github', ['read:user'], {
  createIfNone: true,
})
```

It sends that short-lived GitHub access token only to the Scrolltastic publish API.
The API resolves the GitHub identity and authorizes it against a server-owned
publisher allow-list. A later account system can replace this authorization adapter
without changing package layout or Story Language.

The API issues short-lived, pathname-scoped Vercel Blob client tokens. Prepare and
commit authorizations are signed with `SCROLLTASTIC_PUBLISH_SECRET`; each upload token
is bound to one prepared manifest entry, including its pathname, type, and byte limit.
The API never
returns the store read/write token. Token constraints MUST include the exact staging
pathname, expected content type, maximum byte size, expiry and overwrite policy.

`SCROLLTASTIC_PUBLISHERS` is a comma-separated, case-insensitive GitHub login allow-list.
`SCROLLTASTIC_PUBLISH_SECRET` must be an independently generated secret of at least 32
characters. Both values and `BLOB_READ_WRITE_TOKEN` are server-only Vercel environment
variables. The extension reads the API origin only from user settings; workspace settings
cannot redirect the GitHub session token.

## Blob layout

```text
_staging/<publisher>/<publish-id>/<story-id>/
  story.json
  assets/...
  cards/...

_releases/<story-id>/<release-id>/
  story.json
  assets/...
  cards/...

<story-id>/
  story.json
  assets/...
  cards/...
```

The stable `<story-id>/` package is the only location consumed by the reader. It
preserves the executable V5 contract: the document and all authored media paths
remain package-relative under one trusted root and package prefix.

Staging isolates incomplete uploads. Immutable releases provide an audit and
rollback source. The stable package provides the existing predictable reader URL.
Release and publish IDs are server-created UUIDs, not author-controlled paths.

## Publish protocol

### 1. Preflight in VS Code

The **Scrolltastic: Publish Story** command:

1. Requires a trusted, folder-backed workspace and an open `story.json`.
2. Offers to save dirty story and asset documents before continuing.
3. Parses and validates the exact bytes that will be published with the shared V5
   validator. Errors stop publication; warnings are shown for confirmation.
4. Verifies that the root ID matches the package UUID, every referenced asset exists,
   real paths remain inside the package, and names/extensions obey package rules.
5. Builds a deterministic manifest sorted by relative pathname. Every entry contains
   pathname, byte length, media type and SHA-256 digest.
6. Enforces initial limits: 256 files, 100 MiB per package and 25 MiB per file. These
   are product limits, not Blob platform limits, and may be revised with evidence.

Unreferenced files are excluded and listed to the author. `story.json` is always
included. The extension does not rewrite authored JSON or asset names.

### 2. Prepare

```http
POST /api/publish/prepare
Authorization: Bearer <github-session-token>
Content-Type: application/json
```

```json
{
  "storyId": "50b19320-50ae-4b77-a449-e3f409cfaef8",
  "files": [
    {
      "path": "story.json",
      "size": 1842,
      "sha256": "...",
      "contentType": "application/json"
    }
  ],
  "baseRevision": "optional-current-story-etag"
}
```

The API repeats all ID, path, extension, media type, count and size checks. It returns
`publishId`, an expiry, the current revision, and one constrained client upload token
per staging pathname. `baseRevision` enables optimistic concurrency: publishing over
a newer remote story requires explicit overwrite confirmation and a new prepare
request.

### 3. Upload staging package

The extension uploads directly to Blob with `@vercel/blob`, using only the issued
client token for each exact staging pathname. Large files use multipart upload.
Progress is reported through a cancellable VS Code notification.

Uploads may run with bounded concurrency (initially three). Assets upload before
`story.json`. Failure leaves only an uncommitted staging prefix, which a scheduled
cleanup can remove after 24 hours.

### 4. Commit

```http
POST /api/publish/commit
Authorization: Bearer <github-session-token>
Content-Type: application/json
```

```json
{
  "publishId": "server-issued-uuid",
  "storyId": "50b19320-50ae-4b77-a449-e3f409cfaef8",
  "baseRevision": "optional-current-story-etag"
}
```

The API:

1. Reauthorizes the publisher and verifies publish ownership and expiry.
2. Verifies every staged object's size/digest against the prepared manifest.
3. Reads and validates staged `story.json` with the canonical parser, including ID
   agreement and referenced asset completeness.
4. Copies the complete staging package to immutable `_releases/...` storage.
5. Copies assets/cards to the stable package first.
6. Copies `story.json` last, using Blob `ifMatch` conditional write semantics for the expected
   revision. This document copy is the publication commit point.
7. Returns the new revision, release ID and reader URL.

The stable Blob pathname is overwritten deliberately. Vercel Blob documents a
minimum 60-second propagation window for overwritten content, so the extension says
“Published; updates may take up to a minute to appear” rather than promising instant
global consistency.

### 5. Result

On success, VS Code offers:

- **Open Published Story** — `https://scrolltastic.vercel.app/s/<story-id>`
- **Copy Story Link**
- **View Output** — release ID, revision, files and byte totals

The extension stores only non-secret publication metadata in workspace state:
story ID, revision, release ID, publish time and public reader URL. Authentication is
owned by VS Code's authentication provider.

## API error contract

Errors use JSON with a stable code and safe message:

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "This story changed after your last publish check."
  }
}
```

Initial codes are `unauthenticated`, `forbidden`, `invalid_manifest`,
`invalid_story`, `missing_asset`, `upload_expired`, `upload_incomplete`,
`revision_conflict`, `package_too_large`, `rate_limited` and `internal_error`.
Validation responses may additionally carry the existing categorized diagnostics and
authored JSON paths. Server logs contain IDs and counts, never GitHub or Blob tokens.

## Reader cutover

Production cutover was completed in this order:

1. Copy the existing conformance fixtures to their stable Blob package paths.
2. Set the Production-only `VITE_STORY_ROOT` to the Blob base URL.
3. Deploy the environment-aware reader.
4. Verify direct `/s/<id>` navigation, story JSON and artwork requests against Blob.

The future publish API must use the same stable package layout and run its integration
suite against an isolated staging prefix before it can write production packages.

Do not silently fall back from Blob to bundled packages. A fallback could display an
old story after a publish or deletion failure and would obscure the authoritative
content source.

## Implementation status

Implemented: deterministic manifest/path/digest helpers, local schema validation,
GitHub allow-list authorization, signed prepare/upload/commit contracts, direct Blob
uploads, server-side byte/digest/schema verification, immutable release copies,
conditional stable commits, progress/cancellation, conflict UI, and publication metadata.

Deployment verification against the production store and automated cleanup of abandoned
staging prefixes are operational tasks. Rollback, story deletion and multi-user ownership
remain deliberately outside the first extension command.

Rollback and deletion are deliberately not part of the first extension command.
They are destructive operations and require explicit ownership, retention and
recovery policy first.
