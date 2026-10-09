# Nostr authentication

Nostr is the primary Scrolltastic browser identity mechanism. The initial integration
uses a NIP-07 browser signer and a hardened NIP-98-style ephemeral event. OIDC remains
available as an optional fallback endpoint.

## Security model

Scrolltastic never receives a private key. It creates a random one-time challenge,
stores only its SHA-256 digest, and asks the signer to approve a kind `27235` event.
The event is bound to the exact session URL, `POST`, challenge and canonical request
payload digest. The server independently validates event structure, ID, Schnorr
signature, timestamp and every binding, then consumes the challenge transactionally.

Challenges expire after two minutes, are tied to an HMAC client fingerprint and are
rate-limited. Replays, duplicate binding tags, altered payloads, changed signer keys,
cross-origin mutations and inactive accounts fail closed. The resulting browser
session uses the existing signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie.

## Configuration

Nostr uses the existing:

```text
DATABASE_URL
SCROLLTASTIC_APP_ORIGIN
SCROLLTASTIC_SESSION_SECRET
```

Optional:

```text
SCROLLTASTIC_AUTH_CHALLENGES_PER_MINUTE=10
```

Apply migration `0006_nostr_authentication.sql` before enabling the sign-in control.
The normal generation reconciliation job also removes expired challenges in bounded
batches.

## First owner

Import production inventory with a raw lowercase hexadecimal public key, not `npub`:

```sh
npm run db:import-production -- \
  --organization-id=<uuid-v4> \
  --organization-name=<name> \
  --owner-nostr=<64-character-hex-public-key> \
  --story-id=<story-uuid>
```

The public key becomes `accounts.provider_subject` with provider `nostr`. Possession
of a key authenticates an account but grants no access by itself; story membership
and rollout allow-lists remain authoritative.

## User experience

For authorable stories, anonymous readers see **Sign in with Nostr** as the primary
authoring action. A NIP-07 signer must be installed and enabled. Signing creates a
session only; it does not publish the ephemeral event to relays. Authenticated users
can sign out from the same authoring controls.

NIP-05 identifiers are display metadata only and must never replace the public key
as account identity or confer authorization. NIP-46 remote-signer/mobile support and
explicit multi-provider account linking remain later work. Linking must require
fresh proof of both identities and must never merge accounts by display name,
email, or NIP-05 value.
