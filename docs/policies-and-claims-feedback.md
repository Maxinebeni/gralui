# Policies and claims: what the screens need next

From Maxine (front end) · 14 Oct 2026 · compares the backend `dev` branch
(policy and claims endpoints from 13 Oct) with the screens already built on
sample data (`src/lib/types.ts`: `Policy`, `PolicyDetail`, `Claim`).

Thank you for the policy API, the catalog and the seeded test users. They
unblock testing on staging. Below is what the screens show that the API does
not return yet, in the order we need it.

## Policies (TC)

What works now: register a policy with insurer, product, policy number and
dates; list a client's policies; read one policy and its periods. That is
enough to link a claim to a policy period.

Still needed for the client file and the policy page:

| Needed | Why | Backlog |
|---|---|---|
| Sum insured, net premium, total premium, amount paid, commission rate on each period | Shown in the policies table and the Financials card. They come from the import template v3.1. Until then the screens show "Not recorded". | POL-03 |
| Balance and commission, worked out by the backend | Balance = total premium − amount paid; commission = net premium × rate | POL-03 |
| Status (Active, In Renewal, Lapsed, Cancelled) | Status chip; worked out from dates and movement, as the template says | POL-02 |
| Movement (NEW, RENEWAL, END R, END N, cancellation) and insurer booking note | Cover periods table and history | POL-04 |
| Plate and UPI (when the product needs them) | Import template "Depends" columns | POL-02 |
| A way to correct or endorse a policy | Periods are immutable, so a typing mistake cannot be fixed today. The Edit Policy form needs an endpoint (a new movement or period). | POL-04 |
| `GET /api/v1/policies?…` for non-admin roles (by expiry, insurer, number) | Search by policy number, and renewals by expiry date. Only the admin can list across clients now. | POL-05 |

Questions:
1. Should the front end read the insurer and product dropdowns from `/api/v1/policy/catalog/…` from now on? The seed only has `DEV_POLICY_INSURER` / `DEV_MOTOR_COVER`. Will GRAL's official list be loaded on staging?
2. Policy numbers are not unique. Is "policy number + insurer" what staff should search by?

## Claims (Christian)

What works now: register a claim against a client and a policy period
(checks the loss date is inside the cover), read one claim, and list a
client's claims. The state is always `REGISTERED`.

Needed next, following GRAL's six SOP steps (the screens already do all of this on sample data):

| # | Needed | Why |
|---|---|---|
| 1 | **At registration:** `dateReported`, `priority` (P1, P2, P3), and the handler (`ownerId`) chosen on the form | The 24-hour SLA starts when the client reports the loss. Priority drives the queue. The form lets the manager pick the handler. |
| 2 | **Names in the response:** client name, policy number, insurer and product names, owner's full name | So the queue does not make one extra call per claim |
| 3 | **A queue list for non-admin roles:** `GET /api/v1/claims?state=&priority=&slaStatus=&ownerId=&page=` | The Claims Queue and All Claims pages list claims across all visible clients. Only per-client and admin lists exist now. |
| 4 | **Steps:** `REGISTERED → DOCUMENTS → SUBMITTED → FOLLOW_UP → SETTLEMENT → CLOSED`, with `stepStartedAt` and a backend `dueDate` (Rwanda working days, WFL-01) | Progress bar, SLA chips, "Overdue 2d" |
| 5 | **Documents checklist:** required document names; each with received date and the linked document version | "Ready to submit" stays blocked until all are in. The document API needs to accept `subjectType=CLAIM` (only `CLIENT` today). |
| 6 | **Submission:** submitted date, insurer claim number, intimation letter (document) | Step 3 |
| 7 | **Follow-ups:** date, channel (email, call, letter, meeting), note, insurer responded yes/no; plus `daysWithoutInsurerResponse` and an escalation flag at 15 working days | Step 4 and the escalation warning |
| 8 | **Dispute:** rejection reason and date; Claims Committee decision (appeal or accept the rejection), who decided, note, evidence | The dispute path (DMD chairs, 5 working days) |
| 9 | **Settlement:** offer amount and date; sign-off chain and who signed (or through the approvals API, see the approvals doc); paid-to-client date and payment advice | Step 5 |
| 10 | **Closure:** outcome (settled, rejection accepted), date, discharge voucher or committee record | Step 6 |
| 11 | **Fraud flag** returned only to the Technical Director, Risk & Compliance Manager and MD | Hidden from everyone else |
| 12 | **Internal notes and history:** add a note; read the audit history of the claim | Activity Log and Internal Notes tabs |
| 13 | **`version` on every change** (already returned) and `STALE_VERSION` on conflicts | Two people working on one claim |

The open GRAL questions are the same as in the backend docs: who decides
disputes, the 15-working-day clock, and the settlement sign-off amounts.
Rachel is asking GRAL by Fri 16 Oct.

## What we tested

- The front end now shows "Not recorded" for any missing client or policy value, instead of a blank.
- Staging has the policy and catalog endpoints. The claims endpoints are on `dev` but not on staging yet.
- We still need the shared password for the `seed-…@globalrisk.rw` test users to sign in as each role on staging.
