# Audit technique initial — Y

Date: 2026-11-09
Base branch: main
Base SHA: 8652cf7540cf115328ccb0010859850f57884c88
Audit branch: audit/production-hardening

## Scope inspected

- server/src/config.ts
- server/src/routes/auth.ts
- server/src/lib/auth.ts
- server/src/lib/http.ts
- server/src/db/schema.ts
- server/src/db/index.ts
- server/src/routes/live.ts
- server/src/routes/shop.ts
- server/src/routes/videos.ts
- server/src/realtime.ts
- server/src/lib/serialize.ts
- server/src/index.ts
- server/smoke.ts
- client/src/lib/api.ts
- client/src/lib/socket.ts

## Confirmed findings

### P0 — Financial integrity

1. Arbitrary wallet credit: `server/src/routes/live.ts`, POST `/wallet/topup`. The route reads `req.body.amount`, clamps it, and directly increments `users.coin_balance`. No payment-provider confirmation or ledger entry is required.
2. Gift debit race: `server/src/routes/live.ts`, POST `/rooms/:id/gifts`. Balance is read before the transaction; the subsequent decrement has no `coin_balance >= amount` predicate and its affected-row count is not checked. Concurrent requests can invalidate the pre-check.
3. Orders marked paid without payment: `server/src/routes/shop.ts`, POST `/orders`. The route inserts `status = 'paid'` without any payment intent/provider verification. It then decrements inventory. This is not a real payment flow.
4. No financial ledger/payment schema: `server/src/db/schema.ts` has a scalar `users.coin_balance`, gift messages, orders and order items, but no wallet transaction ledger or payment records.

### P0 — Authentication/session controls

5. Production secret validation is incomplete: `server/src/config.ts` rejects a missing `Y_SECRET` in production, but does not reject weak, short, malformed or known values.
6. Access-token revocation is absent: `server/src/lib/auth.ts` validates JWT signature and expiry only. `/logout` deletes a refresh session; `/me/password` deletes refresh sessions. Already-issued access JWTs remain valid until expiry (default seven days).
7. Refresh rotation is implemented as read-then-delete in `consumeSession`, followed by a separate insert in `/refresh`; the consume-and-replace operation is not one atomic transaction.
8. Registration has no rate limiter. Login has an IP-only in-memory limiter; refresh and sensitive mutations do not have dedicated limits.

### P1 — WebSocket and HTTP security

9. WebSocket bearer token is sent in the query string: `client/src/lib/socket.ts` constructs `/ws?token=...`; server reads it from `req.url` in `server/src/realtime.ts`. URL tokens can leak into access logs and tracing.
10. WebSocket `subscribe` accepts any supplied room ID without checking room existence, membership, visibility or authorization. `typing` broadcasts to the supplied room ID without verifying conversation membership.
11. Upload validation trusts the browser-supplied MIME string: `server/src/routes/videos.ts` checks only `file.mimetype.startsWith('video/')`. No signature/magic-byte validation or media probe is performed in this upload path.
12. CORS permits arbitrary localhost/127.0.0.1 origins even when production allow-list is configured: `server/src/index.ts`. No Helmet/security-header middleware is mounted in the inspected entrypoint.
13. Express URL-encoded body parser has no explicit size limit in `server/src/index.ts`; JSON is limited to 2 MB.

### P1 — Performance and database architecture

14. SQLite uses `node:sqlite` `DatabaseSync` and synchronous `prepare().all/get/run` calls in `server/src/db/index.ts`. All DB work runs on the Node event loop.
15. N+1 serialization is confirmed in `server/src/lib/serialize.ts`: each `serializeVideo` loads its author, tags, sound, liked/saved state, optional parent and likedBy; `serializeUser` adds up to three relationship queries. Feed/profile routes map this serializer over result arrays.
16. Realtime state (`clients`, rooms and notification sender) is process-local in `server/src/realtime.ts`; there is no cross-instance pub/sub adapter.

### P0/P1 — Schema lifecycle and operations

17. Schema initialization executes a static collection of `CREATE TABLE/INDEX IF NOT EXISTS` statements at startup. No versioned migration history, migration runner or rollback mechanism is present in the inspected DB module/schema.
18. Health endpoints only return a static OK response; no DB-backed readiness endpoint is present in `server/src/index.ts`.
19. No graceful SIGTERM/SIGINT shutdown handler is present in the inspected entrypoint; the server and SQLite connection are not explicitly closed there.

## Existing tests and verification limitations

- `server/smoke.ts` exists and contains route-level checks, including wallet top-up and order creation. Those checks currently validate the simulated credit / paid-order behavior, not real payment-provider verification.
- The root scripts expose build, smoke and typecheck; server smoke script is `tsx smoke.ts`.
- No test/build/typecheck command was executed during this remote source inspection. The available GitHub connector can read and write repository content but does not provide a local shell for running npm commands.
- CI state has not yet been established for the audit branch. No green build/test claim is made.

## Recommended remediation order

1. Disable unverified wallet top-ups and stop marking orders paid without a verified payment provider. Add guarded atomic wallet debits and an immutable transaction ledger.
2. Add access-token revocation/versioning and atomic refresh-token rotation; validate production secret strength and add limits to register/login/refresh and financial mutations.
3. Authorize WebSocket room subscriptions and typing events; remove query-string token transport where client/server compatibility permits.
4. Validate uploaded file signatures and media metadata; add HTTP security headers and strict production CORS/body limits.
5. Batch serializer relation reads and measure query counts before/after.
6. Introduce versioned, non-destructive migrations and backup/restore procedures before any schema evolution.
7. Add DB readiness and graceful shutdown; then add reproducible integration/concurrency/E2E coverage.

## Safety constraints

No existing data was modified. No feature was removed during this audit. No migration, deployment, payment, test, build or CI result is claimed.


## Remediation progress on `audit/production-hardening`

The following initial findings now have code changes in this branch (not yet runtime-verified):

- Wallet top-up is rejected with HTTP 503 until a verified payment provider exists.
- Shop checkout is rejected with HTTP 503 until a verified payment provider exists; it no longer creates paid orders or decrements stock.
- Gift debits use a conditional SQL update inside a transaction, preventing the balance pre-check race from creating a negative balance.
- Access JWTs carry a session identifier and are checked against the persisted session. Refresh rotation consumes the previous refresh token and creates the replacement atomically. Logout and password changes revoke prior access tokens by deleting their sessions.
- Production JWT secret validation rejects missing, short and trivial values.
- Registration and refresh now have per-process IP limits in addition to login; a global per-process request ceiling is mounted.
- WebSocket authentication moved from a query-string token to the first message frame. Subscriptions are limited to live rooms or conversations where the user is a member; event volume and frame size are capped.
- HTTP security headers, production-only HSTS, restricted localhost CORS exception and a URL-encoded body limit were added.
- Video uploads now check a small set of recognized file signatures after Multer writes the file.
- Smoke assertions were updated for disabled unverified payments, refresh/logout revocation, WebSocket authorization and invalid upload signatures.

### Remaining limitations

- No payment provider is configured; wallet funding and shop checkout intentionally remain unavailable.
- No immutable financial ledger, idempotency-key model, refund/reconciliation process or verified provider webhook exists yet.
- Rate limiting is still process-local and is not safe as a shared multi-instance quota.
- Video signature validation is not a substitute for ffprobe-based duration/codec validation or quarantine scanning.
- The SQLite driver remains synchronous; serializer N+1 work is not yet optimized.
- Versioned migrations, backup/restore automation, readiness, graceful shutdown, distributed WebSocket pub/sub and comprehensive integration/E2E coverage remain outstanding.
- No build, typecheck or smoke test has been run in this environment. GitHub has not reported a workflow run or status check for the branch HEAD; CI remains unverified.
