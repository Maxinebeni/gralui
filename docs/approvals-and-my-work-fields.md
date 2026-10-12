# Fields needed for approvals and the My Work screens

From Maxine (front end) to Christian · 14 Oct 2026 · backlog APR-01 to APR-04, WFL-02 and WFL-04

The Approvals inbox and the My Work page are built on sample data with exactly
these shapes (`src/lib/types.ts`: `ApprovalRequest`, `ApprovalStep`,
`WorkTask`). If the API returns these fields, Rachel can connect the screens
without changing them. Endpoint names are suggestions; the fields are what
matter. Please comment by **Fri 16 Oct**.

## 1. Approval request

| Field | Type | Example | Why the screen needs it |
|---|---|---|---|
| `id` | string | `APR-2026-014` | Shown and used in links (`/approvals?request=`) |
| `subjectType` | enum | `RENEWAL`, `CLAIM_SETTLEMENT`, `KYC`, `POLICY_ENDORSEMENT` | Type chip, and the link to the record |
| `subjectId` | UUID | | Opens the record being approved |
| `subjectRef` | string | `REN-2026-004` | What staff recognise |
| `subjectRevision` | number | `3` | Shows which version of the record was approved (APR-03) |
| `title` | string | `Renewal recommendation · Public Liability` | Inbox row |
| `summary` | string | `Renew with CORAR at RWF 3,600,000…` | Top of the decision panel |
| `clientId`, `clientName` | UUID, string | | Client column. **Leave out** for Restricted Visibility clients the user cannot see |
| `amount`, `amountLabel` | number, string | `540000`, `Annual commission` | Amount column; the label says what the amount is |
| `policyVersion` | string | `RENEWAL-2026.1` | Which approval rules built the steps |
| `requestedBy` | `{ id, fullName }` | | "Sent by me" tab, and who gets a returned request |
| `requestedAt`, `dueAt` | date | | Sorting and "past due" |
| `status` | enum | `PENDING`, `APPROVED`, `REJECTED`, `RETURNED` | Status chip and tabs |
| `steps` | list (below) | | The ordered approval chain |
| `evidenceRequired` | boolean | `true` | Approve stays disabled until evidence is attached |
| `evidence` | list of `{ documentId, version, fileName }` | | Pinned to an exact document version (DOC-03) |
| `version` | number | `1` | Sent back with each decision; a stale one is refused |
| `history` | list of `{ at, by, text }` | | History list (APR-04) |

**Each step:** `order`, `role` (role code), `informOnly` (Board steps are informed, not asked), `status` (`WAITING`, `PENDING`, `APPROVED`, `REJECTED`, `RETURNED`, `INFORMED`), `decidedBy` `{ id, fullName }`, `decidedAt`, `comment`.

**Also please return** `canDecide: true/false` for the signed-in user. The front end works it out today, but the backend's answer should win.

## 2. Decisions and other actions

| Action | Suggested call | Body |
|---|---|---|
| Inbox | `GET /api/v1/approvals?view=mine\|sent\|decided\|all` | Paged list of the fields above (steps can be summarised) |
| One request | `GET /api/v1/approvals/{id}` | Full request |
| Decide | `POST /api/v1/approvals/{id}/decisions` | `{ decision: APPROVE\|REJECT\|RETURN, comment, expectedVersion }` |
| Send again after a return | `POST /api/v1/approvals/{id}/resubmit` | `{ note, expectedVersion }`. Bumps `subjectRevision`; every step decides again |
| Attach evidence | link a document version (DOC-02) with `subjectType=APPROVAL` | |
| Ask for approval | `POST /api/v1/approvals` (called by the renewal, claim or policy module) | Same logical request twice must return the existing one (APR-01) |

Error codes the screens show a message for: `STALE_VERSION` (409), `NOT_YOUR_STEP` (403), `EVIDENCE_REQUIRED` (422), `COMMENT_REQUIRED` (400, for reject and return), `ALREADY_DECIDED` (409).

## 3. My Work task

| Field | Type | Example | Why the screen needs it |
|---|---|---|---|
| `id` | UUID | | |
| `key` | string | `CLAIM:CLM-2025-089:DOCUMENTS` | Logical key, so the same work never appears twice (WFL-02) |
| `type` | enum | `CLAIM_STEP`, `CLAIM_FOLLOW_UP`, `CLAIM_DISPUTE`, `RENEWAL_MILESTONE`, `APPROVAL`, `KYC_DOCUMENT`, `MANUAL` | Type chip |
| `title`, `detail` | string | `Collect 2 missing documents` | Task column. **No restricted client details** in the text for users who cannot see the client |
| `resourceType`, `resourceId`, `resourceRef` | enum, UUID, string | `CLAIM`, …, `CLM-2025-089` | "Open CLM-2025-089" button |
| `clientName` | string | | Record column (left out when restricted) |
| `owner` | `{ id, fullName }` or empty | | Assigned to a person… |
| `ownerRole` | role code or empty | `DMD` | …or to a role (e.g. Claims Committee, an approval step) |
| `dueDate` | date | | Worked out on the Rwanda working-day calendar (WFL-01) |
| `status` | enum | `OPEN`, `DONE` | |
| `source` | enum | `SYSTEM`, `MANUAL` | System tasks close by themselves when the record moves on; only manual ones have a Done button |
| `createdAt`, `completedAt`, `completedBy` | | | |
| `version` | number | | For reassign and complete |
| `history` | list of `{ at, by, text }` | `Reassigned to Eric Niyonzima` | Task history |

| Action | Suggested call | Body |
|---|---|---|
| List | `GET /api/v1/tasks?scope=mine\|team&status=OPEN\|DONE&dueBefore=` | Counts must not include tasks on records the user cannot see |
| Reassign | `POST /api/v1/tasks/{id}/reassign` | `{ ownerId, reason, expectedVersion }` |
| Complete (manual only) | `POST /api/v1/tasks/{id}/complete` | `{ note, expectedVersion }`. Refuse for `SYSTEM` tasks: completing a task must not move the record |
| Add | `POST /api/v1/tasks` | `{ title, detail, resourceType, resourceId, ownerId, dueDate }` |
| People to assign to | `GET /api/v1/tasks/assignees` | `{ id, fullName, roles }` |

## 4. Questions for you

1. **Permission codes.** Are these the names? `APPROVAL_READ`, `APPROVAL_DECIDE`, `APPROVAL_READ_ALL` (oversight: MD, DMD, TD, Risk & Compliance, Internal Audit), `TASK_READ`, `TASK_MANAGE_TEAM` (see and reassign the team's work).
2. **Claim settlement sign-off.** Will this go through APR, or stay inside the claims module? The front end shows it in the inbox either way.
3. **Approval rules for endorsements and KYC.** The sample uses the Technical Director then the DMD for endorsements, and the Risk & Compliance Manager for KYC. These are guesses; GRAL needs to confirm.
4. **Board steps.** We record them as informed when the MD approves. Is that right?
5. **Decision deadline.** The sample gives approvers 2 working days. What should it be?
