# Leads screens and the onboarding backend

From Maxine (front end) to Rachel, Toochukwu and Christian · 23 Oct 2026

The Leads screens now follow the backend exactly as Toochukwu built it (ADR-027,
`backend/docs/api/onboarding.md`). This replaces the field proposal from 21 Oct,
which assumed one case per prospect.

## The model, in one paragraph

A **lead** is the prospect and covers SOP steps 1 and 2. Once the prospect client
is open, each policy to place is a separate **policy track** (an onboarding case)
running steps 3 to 11 on its own; one lead can have several. **KYC** is a review
of the client, shared by all of its tracks. Each new action has its own `commandId` and the observed resource version. An
identical retry keeps that ID, version, payload and confirmed evidence references.
Most actions need a document uploaded first as proof. Each track returns `availableActions` and `blockers`,
and the screens show exactly those.

## Screens and the calls they make

All calls are in `src/lib/api.ts`, section "Leads and onboarding". Each already
calls the real endpoint when signed in to a backend, and uses sample data in
the same shapes in demo mode (`src/lib/mock-leads.ts`).

| Screen | Address | Reads | Actions |
|---|---|---|---|
| Leads list | `/clients/leads` | `GET /leads`, `GET /onboarding-cases` | `POST /leads` (+ `/assignment` when the AE is chosen) |
| Lead | `/clients/leads/{leadId}` | `GET /leads/{id}`, `/leads/{id}/onboarding-cases`, `/leads/{id}/history`, `/clients/{clientId}/kyc-summary` | `/assignment`, `/confirm-registration`, `/record-response`, `/assessment`, `/prospect`, `/link-client`, `/close`, `POST /leads/{id}/onboarding-cases` |
| Steps 3 to 11 (on the lead page; `?track={caseId}` picks the policy; `/clients/leads/tracks/{caseId}` is a standalone scoped workspace) | `GET /onboarding-cases/{id}`, `/history` | every `POST /onboarding-cases/{id}/…` command (see `TRACK_ROUTES`) |
| KYC review | `/clients/kyc/{kycCaseId or clientId}` | `GET /kyc-cases/{id}`, `/history`, `/clients/{id}/kyc-cases`, `/kyc-templates` | `GET /kyc-reviewers`, `POST /kyc-cases/{id}/assignment`, `POST /kyc-cases`, `PUT /requirements/{code}`, `/record-screening`, `/submit`, `/decisions`, `/escalate`, `PUT /kyc-templates/{code}` |

Proof documents are uploaded with `POST /documents?subjectType=LEAD|ONBOARDING|KYC&subjectId=…&purpose=…`
using the purpose each command checks (for example `MEETING_SUMMARY`, `RISK_SURVEY`,
`SCHEDULE`, `INSURER_LICENSE_<insurer UUID without hyphens>`, the KYC requirement code).

Approvals for a track (`subjectType ONBOARDING`) appear in the Approvals inbox as
"New business" and link back to the track. My Work shows the backend's own tasks.

## Rachel: please check against staging

The request and response contracts were rechecked against the running local
`/v3/api-docs` and synthetic role-based journeys on 28 Oct 2026. Response shapes
also match the Java records (`LeadView`, `OnboardingView`, `KycView`, `KycGateView`).
Keep these shapes consistent when checking staging:

- the list endpoints return `{ items, page, size, totalElements }` (also `/clients/{id}/kyc-cases`);
- history items are `{ action, actorId, reason, occurredAt }`;
- the document purpose accepted for each upload above.

## Current configuration and backend dependencies

- Default individual/corporate checklists and four onboarding approval policies
  are migration-seeded. Live approvals are enabled unless explicitly disabled.
- Checklist updates append versions and return an empty successful response;
  the frontend reloads the current templates afterward.
- Eligible compliance reviewers come from `GET /api/v1/kyc-reviewers`.
- Specialist assignment uses the delivered scoped technical/underwriting lookup
  `GET /onboarding-cases/{id}/assignees`, with eligibility and pagination described
  in [the resolved backend handoff](onboarding-backend-handoff.md). Lookup failures
  remain visible and never enable arbitrary-ID assignment.
- Scoped specialist links open a standalone track; general client/lead and raw
  KYC access remain separately authorized.
- `GET /kyc-cases/{id}/history` returns an array, unlike paged lead/track history.
- See [verification instructions](onboarding-validation.md) for automated checks
  and the local synthetic acceptance runner.

## Demo-mode rules

Demo mode applies the same gates as the backend (KYC before quotes, three
insurers or an exception, every insurer accounted for, approval by commission
tier, written acceptance, asset list for property, matching schedule) and the
same role permissions, so switching the sample role shows what each person can do.
