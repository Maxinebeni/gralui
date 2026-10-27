# Onboarding frontend integration handoff

The frontend now uses the current onboarding contracts, including
`GET /api/v1/kyc-reviewers`. Backend changes are owned by the backend team;
this frontend delivery does not modify the backend repository.

## Resolution confirmed: 28 October 2026

The reported backend blockers are resolved in the running local backend.
Synthetic role-based acceptance completed all 11 stages for standard, large/
property, and strategic tracks, including MD recording of the Board decision,
conversion, renewal creation, and welcome. The specialist picker also passed a
real browser assignment at desktop and mobile widths. See the
[validation report](onboarding-validation.md) for the scope and record prefix.

## Delivered specialist lookup

These endpoints are available and integrated:

```http
GET /api/v1/onboarding-cases/{id}/assignees?responsibility=TECHNICAL&page=0&size=100
GET /api/v1/onboarding-cases/{id}/assignees?responsibility=UNDERWRITING&page=0&size=100
```

```json
{
  "items": [{ "id": "user-uuid", "fullName": "Eligible staff member" }],
  "page": 0,
  "size": 100,
  "totalElements": 1,
  "totalPages": 1
}
```

- Require a current Business CRM/MD caller with `ONBOARDING_ASSIGN` and case access.
- Match the existing assignment eligibility checks: active staff, the Technical
  Director role or the case's GI/medical underwriting role, and the required
  `CLIENT_READ`, `ONBOARDING_READ`, and `TASK_READ` permissions.
- Filter before pagination and order by full name, then ID.
- Do not require the prospective assignee to already have restricted-client access.
- Revalidate eligibility on assignment. The UI treats lookup results as advisory.
- Retain the existing versioned assignment command and required reason.

Live checks confirmed CRM/MD access, technical and GI/medical eligibility,
pagination, restricted-client assignment, and rejection of unauthorized callers,
invalid parameters, missing reasons, and an assignee with the wrong role.
The frontend picker uses these URLs. A lookup failure produces a visible error
and retry action; assignment stays disabled. It does not use administrator user
listing or accept typed UUIDs. Existing account
manager selection remains backed by `/clients/managers` and the current client's
manager. Changing that manager is a separate client command.

## Swagger corrections confirmed

- Assignment command schemas now mark the reason as required.
- `PUT /kyc-templates/{code}` now documents `204 No Content` and returns it live.
- Catalog creation now documents `201`; product linking documents `204`.

## Resolved: insurer-license evidence purpose

The original stage-6 failure came from conflicting purpose syntax:

- `InsurerLicensingService` consumes the exact purpose `INSURER_LICENSE_` plus
  `UUID.toString().replace("-", "")`, which includes lowercase hexadecimal letters.
- Document upload and version queries previously accepted only uppercase codes,
  rejecting that value before the license command could run.

The backend now permits the exact case-sensitive
`INSURER_LICENSE_[0-9a-f]{32}` form alongside ordinary uppercase purposes. Live
uploads and licensing qualification passed for all three tracks using lettered
insurer UUIDs. Version listing, exact linking, and original PDF download also
passed. Existing purpose values are preserved; the frontend does not rewrite them.

RFQ, placement, conversion, and welcome acceptance are no longer blocked.

## Resolved: task-list server error

The synthetic GI account now receives:

- `GET /api/v1/tasks?assignedToMe=false&size=100`: `403` when it lacks `TASK_ASSIGN`.
- `GET /api/v1/tasks?assignedToMe=true&size=100`: `200`.

CRM team-task listing returns `200`. The frontend already falls back from a
team-query `403` to personal tasks. The earlier `500 INTERNAL_ERROR` did not recur;
standalone restricted-track access also passed throughout the live workflow.

## Evidence and operational boundaries

Board approval from the inbox now uses the onboarding Board-recording command.
Recovery of a previously approved inbox decision reuses its original document
and version. Hidden evidence metadata blocks recovery rather than substituting
a new file. No Board account is introduced.

Command retries retain the command ID, original observed version, serialized
payload, and confirmed uploads for the mounted form. A document upload whose
response was lost remains outside that guarantee: the upload API has no
idempotency key. Command replay does not automatically advance a stale edit to
the resource's latest version.

No open blocker remains from this handoff in the tested local synthetic
environment. No backend repository changes or external messages were made by
the frontend verification work.
