# Onboarding verification

## Closeout results: 28 October 2026

- Automated regression suite: 72 tests passing, covering mocked API contracts,
  React interactions, and the demo assignment/strategic approval lifecycle.
- TypeScript passed again during closeout. The production build passed during
  frontend delivery; no application source changed during this backend recheck.
  The existing Google Font download requires network access when it is not cached.
- Headless Chrome previously checked step-3/shared KYC assignment and a restricted
  standalone track. Closeout additionally exercised the delivered specialist
  picker: technical choices, switching to underwriting choices, reasoned
  assignment, backend persistence, and case refresh. Desktop (1440px) and mobile
  (390px) layouts showed no horizontal overflow or runtime exceptions.
- Live synthetic backend checks passed registration, assignment, confirmation,
  response, assessment, duplicate review, prospect creation, shared KYC,
  missing-reviewer/stale-version rejection, screening/decision, history arrays,
  specialist access without parent-lead access, deadline adjustment, survey,
  programme, empty checklist updates, and fresh KYC after template invalidation.
- Live 11-stage acceptance now **passes** for STANDARD, LARGE/property, and
  STRATEGIC/property tracks: real licence evidence, RFQ, quotes, tiered internal
  approval, MD recording of the Board decision, client acceptance, property asset
  lists, placement, exact schedule verification, conversion, policy/period/renewal
  references, and completed welcome.
- Scoped specialist lookups passed pagination and role/access checks. Additional
  HTTP checks passed medical/GI separation, matching CRM/MD choices, invalid
  parameters, missing assignment reasons, and wrong-role assignee rejection.
- The lowercase insurer-UUID licence purpose now works for upload, qualification,
  version listing, exact linking, and original PDF download. The earlier backend
  purpose-validation conflict did not recur.
- Underwriting personal tasks return `200`; the team query returns `403` without
  `TASK_ASSIGN`, which triggers the existing frontend personal-task fallback.
  CRM team tasks return `200`. The earlier task-list `500` did not recur.
- Live Swagger includes the specialist lookup and required assignment reasons,
  and correctly documents checklist updates (`204`), catalog creation (`201`),
  and product linking (`204`).

No reported backend blocker remains in the tested local synthetic environment.
The latest complete API run used record prefix `FRONTEND QA 1793138051254-2194`.
Browser assignment and additional medical-role checks used the prior isolated
`FRONTEND QA 1793134846768-1614` fixture. Partial earlier runs are retained under
the same test prefix; no existing users or existing insurers were modified.

### Single-source follow-up: 28 October 2026

The three live closeout journeys invited three insurers and did not exercise
single-source exception submission. A subsequently reported failure exposed an
older action-panel form that labelled the justification as an optional note.
That panel now uses the shared required-justification form. Both entry points
are covered by interaction tests; HTTP tests assert the exact flat `detail`
payload and reject missing, blank, or oversized text before any upload. All 54
tests and typecheck pass after this correction.

The endpoint requires a nonblank `detail` of at most 2000 characters at runtime.
Its shared Swagger evidence schema still lists `detail` as optional; this is an
action-specific requirement enforced by the backend service.

### Responsibility handoff follow-up: 28 October 2026

The lead and standalone views now recognize the placement milestone after
acceptance, show "Presentation and acceptance complete", and identify the
GI/medical underwriter as the current owner. Waiting messages describe insurer
instruction or the property asset-list prerequisite. Stage-10 ownership also
follows the technical-check and final-verification prerequisites. Actions remain
restricted to the backend's `availableActions`; the backend controls stage changes.

Eighteen additional interaction checks cover both views, GI/medical roles,
concealed acceptance evidence, incomplete acceptance, property assets, authorized
placement, technical handoffs, and completed cases. The 72-test suite, typecheck,
and production build pass. Headless Chrome also checked the reported Irad Steels
Limited case as its actual AE in both views at 1440px and 390px: correct ownership
and waiting text, no placement action for the AE, no overflow or runtime errors.
No case data was changed during browser verification.

## Automated checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Vitest and React Testing Library exercise permission-sensitive KYC controls,
reviewer selection, duplicate review invalidation, original Board evidence,
single-source status/replacement, specialist lookup failures, deadlines, history,
pagination, exact command retries, and standalone track rendering. HTTP tests
mock the API and assert wire payloads and failure behavior; they do not mutate
the running backend.

## Local synthetic backend acceptance

`scripts/verify-onboarding.mjs` is restricted to localhost/127.0.0.1. Supply these
environment variables from your test credential source; do not commit values:

- `ONBOARDING_TEST_ADMIN_EMAIL`
- `ONBOARDING_TEST_ADMIN_PASSWORD`
- `ONBOARDING_TEST_STAFF_PASSWORD`
- Optional `ONBOARDING_TEST_BASE_URL` (default `http://localhost:8080`)

```powershell
node scripts/verify-onboarding.mjs
```

The script authenticates existing distinct Business role accounts, creates an
isolated synthetic product and three synthetic insurers, a restricted prospect,
and a dedicated checklist. It validates standard, large/property, and strategic
policy tracks through all 11 stages using shared approved KYC. It also checks
missing-reviewer submission, stale assignment, array-shaped history, restricted
track access without parent-lead access, explicit deadlines, checklist `204`
responses, and starting a fresh review after checklist invalidation.

Synthetic evidence is labelled as test-only and does not represent real screening,
licensing, signatures, or coverage. Existing user accounts and existing insurer
configuration are not changed. Test records remain labelled `FRONTEND QA` for
audit; the script does not delete them, and failed runs may leave partial records.
Keep the printed record prefix when investigating a failed run.

The script validates backend contracts, not browser interaction. It checks the
scoped specialist lookup, including pagination, before assigning existing test
staff. Only the acceptance runner uses administrator user discovery to choose
its role accounts; the application exclusively uses the scoped lookup. Additional
closeout HTTP checks covered medical filtering, licence-document retention, and
Swagger metadata. Browser picker acceptance is recorded above.

## Browser acceptance checklist

- CRM/MD: step 3 and the KYC page show the same compliance assignment card;
  eligible choices and a reason are required. A lookup failure is actionable.
- AE: submission explains missing reviewer/documents; no staff directory request
  is made. Duplicate review must be repeated after submitted details change.
- Compliance: only the assigned reviewer sees screening/decisions/escalation.
  Starting a fresh outdated/rejected review preserves earlier history.
- Specialist: a task opens its standalone track without general client, lead,
  sibling-track, or raw KYC access. Loss of assignment removes server access.
- Underwriter: pending/rejected exceptions do not relax the invitation minimum;
  returned/rejected exceptions offer a replacement request with justification.
- MD: both Board entry points use the same recording form. Recovery reuses the
  exact approved evidence and requests the actual Board decision date.
- CRM: held cases retain assignment actions but disable deadline adjustment.
- Lost responses freeze fields and offer an identical retry or reconciliation;
  stale versions require refresh. Later-page failures never appear as complete lists.
- Check desktop and narrow layouts, keyboard focus, labels, disabled-action
  explanations, inline errors, and success notifications against existing cards.
