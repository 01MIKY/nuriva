# NURIVA — Project rules

International childcare (NURIVA Kids) and pet-care (NURIVA Pets) platform. Launch market: Miami, FL. Languages: English + Spanish. Currency: USD.
Three applications: client app, caregiver app, admin dashboard — all backed by `apps/api`.

## Non-negotiables
- Production quality, modular architecture, secure coding. Never fabricate integrations, results or verification statuses. Never claim unfinished work is finished.
- Every user-facing string lives in `packages/i18n` (en + es). `pnpm lint:i18n` must pass — no untranslated screens.
- Least privilege: permissions in `packages/domain/src/roles.ts`. Background-screening data requires `screening.read`; every read is audited.
- Sensitive fields (children/pets details, phones, emergency contacts, screening references) are stored encrypted (`*_enc` columns, `packages/db/src/crypto.ts`).
- Audit security-relevant actions with `audit()` inside the same transaction. `audit_log` and `vetting_events` are append-only (DB trigger).
- NURIVA controls vetting; clients make the final selection. Caregivers cannot appear in search or accept bookings until every vetting step has passed (`bookability()` in `packages/domain`).
- Services are inactive until a superadmin records a compliance approval (`service_activations`). Never activate regulated services without documented approval.
- Never promise absolute safety in copy. Flag legal questions in `docs/COMPLIANCE.md` for counsel.
- Validate all API input with zod `.strict()` schemas. Schema changes go through migrations (`pnpm db:generate`), never manual DDL.
- No secrets in source. Config via env (`.env.example`); staging/production refuse to boot without real secrets.

## Workflow for each feature
Understand requirements → inspect architecture → plan → identify security/legal implications → implement → run `pnpm verify` (must end with "all checks passed"; commit only then) → review → update docs (`docs/STATUS.md`).
Ask the owner before major architecture, cost, provider or irreversible decisions.

## Commands
- `pnpm test` — all tests (needs PostgreSQL; see README)
- `pnpm typecheck`
- `pnpm db:generate` / `pnpm db:migrate`
- `pnpm dev:api`
