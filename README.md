# Clipsetu

Clipsetu is an India-first campaign platform in an incremental move from a browser-only prototype to a persisted application. The new application uses Next.js, TypeScript, Tailwind CSS, Supabase Auth, Postgres, and private Supabase Storage buckets.

The existing browser demo is preserved at `/demo/index.html`. Its local-storage data and role switch are isolated and are not authentication or shared platform data. Never enter real payment, identity, or banking information in that demo.

## Supabase project

- Organization: `muse media` (Free plan)
- Project: `clipsetu`
- Region: Mumbai (`ap-south-1`)
- Project reference: `wayioohkksqdcykefief`
- The four additive migrations under `supabase/migrations/` (core schema/auth, policy hardening, campaign/submission workflows, and workflow access hardening) are tracked and applied to this project.
- Email/password auth is enabled with email confirmation required, a 12-character password minimum, TOTP enrollment/verification, and refresh-token rotation. The current Auth Site URL is `http://localhost:3000`; no preview redirect has been allowlisted yet. Add the exact preview URL in Supabase Auth URL Configuration before testing email callbacks on a Vercel preview.
- Only the public publishable/anon key belongs in browser configuration. Service-role and database credentials must never be committed or bundled.

The Free plan currently creates no additional paid subscription charge. It has plan limits and does not imply backups, an SLA, or escrow. Verify the active Supabase billing page before enabling paid resources or changing plans.

## Run locally

1. Install Node.js 20.9+ and npm.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Clipsetu Supabase project's public API settings.
3. Run `npm ci` and `npm run dev`.
4. Open `http://localhost:3000`.

The local `.env.local` also stores the newly generated database password with owner-only file permissions; it is ignored by Git. Do not paste it into chat, commit it, or add it to Vercel's public environment variables. The application itself does not need the database password.

Email/password signup requires email verification. Public signup accepts only business or clipper requests; every new role starts pending. Admin role changes are unavailable to normal clients, and admin review RPCs require a verified TOTP session (`aal2`).

## First admin bootstrap

No account is automatically made admin. After the owner has signed up and verified the intended email, follow [`docs/admin-bootstrap.md`](docs/admin-bootstrap.md) once from the Supabase SQL Editor. Subsequent access reviews must use the MFA-protected admin workflow. Do not replace the placeholder email until the owner confirms the exact account.

## Database migrations

Migrations are additive and versioned under `supabase/migrations/`. The current new project has no existing production data. For future changes, review the migration diff first, apply it to preview, and keep application rollback separate from database rollback. Never run destructive `DROP`, truncate, or irreversible data transformations without Manu's approval.

For a local Supabase CLI workflow, link the project and push reviewed migrations:

```sh
npx supabase link --project-ref wayioohkksqdcykefief
npx supabase db push
```

The CLI may ask for the database password; use the ignored local environment file or the Supabase dashboard, never commit the password. `npx supabase db reset` is destructive and is not part of the normal workflow.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

The tests check the existing demo safety/CSP, INR-to-paise and IST conversion, HTTPS/platform validation, migration RLS coverage, campaign join-mode enforcement, campaign-bound submissions, receipt-upload restrictions, public role assignment limits, MFA-aware admin functions, and client/server key boundaries. A successful build does not by itself establish production readiness; authenticated session-isolation, tenant-boundary, concurrency, account-recovery, upload, and payment tests remain required.

## Current scope and limitations

The authenticated campaign/submission vertical slice now includes business campaign drafts with append-only versioned terms, review submission, admin publish/change/reject decisions, clipper discovery filters, open or approval-based joining, business decisions on join requests, unique published-post submissions, correction resubmission, and MFA-gated admin review. Campaign and submission writes use guarded, audited database functions; current campaign terms are snapshotted onto each submission. The isolated browser demo remains unchanged. The admin identity still requires the explicit bootstrap step above.

Authenticated cross-user/RLS session tests have not run because dedicated test accounts are not configured. Accepted submissions currently record a review decision only; they do not post earnings or move money. Cumulative-view review UI, reward calculation and idempotent payout transactions, complete private file download flows, recovery/retention operations, backup/restore verification, and verified tenant-isolation E2E tests remain incomplete. Do not label the app production-ready or accept real payout details until those paths are implemented and tested.

The existing Vercel production aliases must remain unchanged. Preview deployments only; a deployment URL must be tied to the pushed commit before it is described as verified.
