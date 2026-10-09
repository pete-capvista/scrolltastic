# Phase 9: hardening and controlled rollout

Implemented locally on 2026-09-29. Production readiness remains conditional on the
deployed-environment checks listed below.

## Automated evidence

| Boundary | Evidence |
| --- | --- |
| Roles and tenant membership | `tests/auth.test.ts`, `tests/persistence.test.ts` |
| CSRF/origin and session tampering | `tests/auth.test.ts` |
| Independent rollout and kill switches | `tests/auth.test.ts` |
| CSP and browser security headers | `tests/security-hardening.test.ts`, `vercel.json` |
| Prompt/tool boundaries and malformed calls | `tests/ai-authoring.test.ts`, `tests/patch.test.ts` |
| Upload type, byte, dimension and active-SVG rejection | `tests/assets.test.ts` |
| Immutable revision, stale head, preview and ETag gates | `tests/revisions.test.ts`, `tests/e2e/editor.spec.ts` |
| Signed publishing replay/tamper/expiry | `tests/publishing.test.ts` |
| Memory approval, scope and context budget | `tests/memory.test.ts` |
| Mobile/desktop keyboard, reduced motion and reader regressions | `tests/e2e/*.spec.ts` |
| Reconciliation, bounded cleanup, leases and dead letters | `scripts/reconcile-*.mjs`, `scripts/cleanup-draft-assets.mjs`, migration `0005` |

Generation allocation now applies a per-account requests-per-minute limit in the same
transaction as concurrency, reservation and daily-token checks. Set
`SCROLLTASTIC_AI_REQUESTS_PER_MINUTE`; the default is 20.

## Deployed-environment gates

Before general eligibility, verify the browser → API → Postgres/Blob/model provider →
durable response flow using a non-production internal story. Exercise provider timeout
and failure, database and Blob partial failure, cleanup/reconciliation, current ETag
conflict, every kill switch, CSP console output, real assistive technology, physical
mobile browsers, alert delivery, retention policy and account deletion.

These checks cannot be truthfully completed against the local fake/mocked services.
The feature should remain allow-listed until their evidence is attached to the release.

Operational response and recovery procedures are in
`docs/authoring-operations-runbook.md`. This phase does not alter Story Language V5.
