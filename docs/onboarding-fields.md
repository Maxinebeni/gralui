# Fields needed for client onboarding (Leads)

From Maxine (front end) to Toochukwu and Christian · 21 Oct 2026 · Extra Sprint ONB-01 to ONB-06

The Leads pages follow GRAL's Client Acquisition SOP (SOP Handbook v3,
section 3): 11 steps from lead to welcome letter. They are built on sample
data with exactly these shapes (`src/lib/types.ts`: `OnboardingCase`,
`OnboardingStepRecord`, `KycItem`, `KycScreening`). If the API returns these
fields, Rachel can connect the screens without changing them. Endpoint names
are suggestions; the fields and rules are what matter. Please comment by
**Wed 21 Oct, end of day**, so Rachel can start connecting on Thursday.

Screens: `/clients/leads` (the list) and `/clients/leads/{id}` (one lead, with
the 11-step tracker).

## 1. Who owns which part

| Part | Backlog | Owner |
|---|---|---|
| Lead (case) registration and list | ONB-01 | Toochukwu |
| Step records: owner, deadline, evidence | ONB-02 | Toochukwu |
| Onboarding permissions per role | ONB-03 | Toochukwu |
| `ONBOARDING` as a document subject | (with ONB-02) | Toochukwu |
| KYC checklist and document receipt | ONB-04 (start of KYC-01) | Christian |
| KYC approval through Approvals | ONB-05 | Christian |
| Welcome step opens the client and policy | ONB-06 | Christian |

## 2. The onboarding case (lead)

| Field | Type | Example | Why the screen needs it |
|---|---|---|---|
| `id` | UUID | | |
| `reference` | string | `ONB-2026-004` | Shown everywhere and used in the address `/clients/leads/ONB-2026-004` |
| `prospect.name` | string | `Nyarugenge Logistics Ltd` | Title. Must be unique among clients **and** open leads (the form refuses duplicates) |
| `prospect.type` | enum | `Corporate`, `SME`, `NGO`, `State Enterprise`, `Financial Institution` | Decides the KYC checklist (section 5) |
| `prospect.sector` | string | `Logistics` | |
| `prospect.address` | string, optional | `Gikondo, Kigali` | |
| `prospect.contact` | `{ name, title, email, phone }` | | Email **or** phone is required |
| `prospect.referralSource` | string | `Referral from an existing client` | Fixed list in `lead-form.tsx`; can become reference data |
| `accountExecutive` | `{ id, fullName }` | | Owner of steps 2, 3, 9 and 11; their name is on the card |
| `registeredBy` | `{ id, fullName }` | | |
| `createdAt` | date | | Start of the 10 to 15 working-day clock |
| `currentStep` | step code (section 3) or `null` | `QUOTES` | `null` = onboarded. The front end works it out today; the backend's answer should win |
| `steps` | list (section 4) | | One record per **finished** step |
| `kyc` | object (section 5) | | |
| `riskGrade` | `Low`, `Medium`, `High` | | Recorded at step 4 |
| `quotes` | list of `{ id, insurer, premium, terms, recommended }` | | Steps 6 and 7. Same shape as renewal quotes |
| `singleSourceReason` | string, optional | | Written reason when fewer than 3 insurers quoted |
| `approvalId` | UUID, optional | | The internal approval request (step 8) |
| `placement` | `{ policyNumber, classOfInsurance, insurer, premium, start, expiry }` | | Step 10 |
| `clientId` | UUID, optional | | Set at step 11, when the client file is opened |
| `history` | list of `{ at, by, text }` | | History card on the lead page |
| `version` | number | | Sent back with each update; a stale one is refused |

## 3. The 11 steps (SOP 3.2)

Deadlines are working days (weekends and public holidays skipped, from the WFL-01 calendar), counted from when the step in "Clock starts" was completed.

| # | Code | Step | Owner (SOP) | Deadline | Clock starts | What it records |
|---|---|---|---|---|---|---|
| 1 | `LEAD` | Lead registration | Commercial Director (CRM Manager assigns the AE) | Same day | Lead created | Done automatically when the lead is created |
| 2 | `MEETING` | Meeting & needs assessment | Accounts Executive | 3 days | `LEAD` | Note + **meeting summary** file |
| 3 | `KYC` | KYC & AML verification | Accounts Executive; signed by Risk & Compliance Manager | 3 days after **the last KYC document arrives** | `MEETING` | Section 5. Completed by the KYC approval, not by a button |
| 4 | `RISK_SURVEY` | Risk survey | Technical Director | 5 days | `MEETING` | Note + **risk grade** + **survey report** file |
| 5 | `DESIGN` | Insurance programme design | Technical Director | 3 days | `RISK_SURVEY` | Note + **programme proposal** file |
| 6 | `QUOTES` | Quotation request | GI Underwriting Manager | 24 hours | `DESIGN` | Quotes (at least 3, or a written reason) |
| 7 | `COMPARISON` | Comparative analysis | GI Underwriting Manager | 2 days | `QUOTES` | One quote marked recommended + note + **comparison matrix** file |
| 8 | `APPROVAL` | Internal approval | TD / MD by commission | Before the presentation (2 days) | `COMPARISON` | Completed by the approval request (section 6) |
| 9 | `ACCEPTANCE` | Presentation & acceptance | Accounts Executive | 3 days | `APPROVAL` | Note + **written acceptance** file |
| 10 | `PLACEMENT` | Policy placement | GI Underwriting Manager | 2 days | `ACCEPTANCE` | `placement` fields + **verified policy schedule** file |
| 11 | `WELCOME` | Welcome & filing | Accounts Executive | 2 days | `PLACEMENT` | **Welcome letter** file; opens the client file (section 7) |

**Each finished step:** `code`, `completedAt`, `completedBy` `{ id, fullName }`, `note`, `evidence` `{ documentId, version, fileName }` (where the table says a file is needed).

## 4. Rules the backend must enforce

The front end checks all of these, but the backend must refuse them too:

1. Steps in order: only the current step can be completed (`NOT_CURRENT_STEP`, 409).
2. A note on every manual step, and the file where the table above asks for one (`EVIDENCE_REQUIRED`, 422).
3. **No quote before the KYC Approval Form is signed** (`KYC_NOT_APPROVED`, 422). This is the SOP's key control.
4. At least 3 quotes, or a written `singleSourceReason`; with a reason, the MD is added to the approval (`TOO_FEW_QUOTES`, 422).
5. Step 7 needs exactly one recommended quote.
6. Placement needs a policy number, class, cover dates (expiry after start) and the schedule file.
7. The same request sent twice must not create a second approval (return the live one).

## 5. KYC (Christian, ONB-04 and ONB-05)

| Field | Type | Notes |
|---|---|---|
| `kyc.items` | list of `{ name, required, hasExpiry, receivedAt, document, expiry }` | Created from the client type when the lead is registered |
| `kyc.screening` | `{ result: CLEAR \| POSSIBLE_MATCH, note, at, by }` | Sanctions and watchlist check. A possible match needs enhanced due diligence |
| `kyc.approvalId` | UUID, optional | The KYC approval request |

- **Checklists per client type** are in `src/lib/onboarding.ts` (`KYC_CHECKLISTS`). They are **provisional**: the SOP only names the Certificate of Incorporation, ID or passport, TIN/VAT certificate and sanctions screening. GRAL still has to confirm the rest. Please keep the list as data, not code, so it can change.
- **Send for approval** is refused until every required document is in, every document with an expiry has its date, and the screening is recorded. An expired document is refused.
- **Approval:** one step, the Risk & Compliance Manager, with `subjectType = ONBOARDING_KYC`. When it is approved, step 3 completes itself and the clock for step 4 starts.
- If it is returned, the AE fixes it and sends again from the same request.
- The KYC documents are uploaded with `subjectType = ONBOARDING` and classification `KYC`.

## 6. Internal approval (step 8)

- `subjectType = NEW_BUSINESS`, amount = expected annual commission (recommended premium × commission rate).
- Approvers use the same commission tiers as renewals: under RWF 1M the Technical Director, up to RWF 10M the MD, above that the MD with the Board informed. Add the MD when there is a `singleSourceReason`.
- When it is approved, step 8 completes itself.
- **My Work:** until the request is sent, the task is "Request internal approval" for the GI Underwriting Manager. After that, the approver's Decide task replaces it.

## 7. Welcome (Christian, ONB-06)

Completing step 11 must, in one transaction:

1. Create the client from `prospect` (name, type, sector, address, contact), with the Accounts Executive as owner.
2. Create the policy from `placement` (new business), so it appears in the renewal tracker.
3. Re-link the onboarding documents (KYC files, meeting summary, proposal, schedule, welcome letter) to the new client. Don't copy the files.
4. Set `clientId` on the case.

## 8. Calls

| Action | Suggested call | Body |
|---|---|---|
| List | `GET /api/v1/onboarding?status=open\|onboarded` | Paged cases (steps can be summarised as `completedSteps`) |
| One lead | `GET /api/v1/onboarding/{id}` | Full case |
| Register a lead | `POST /api/v1/onboarding` | Section 2 prospect fields + `accountExecutiveId` |
| Complete a manual step | `POST /api/v1/onboarding/{id}/steps/{code}` | `{ note, evidenceDocumentId, riskGrade?, expectedVersion }` |
| KYC document received | `POST /api/v1/onboarding/{id}/kyc/items/{name}` | `{ documentId, expiry? }` |
| Screening | `POST /api/v1/onboarding/{id}/kyc/screening` | `{ result, note }` |
| Send KYC for approval | `POST /api/v1/onboarding/{id}/kyc/submit` | Creates the `ONBOARDING_KYC` approval |
| Add / recommend a quote | `POST /api/v1/onboarding/{id}/quotes`, `POST …/quotes/{quoteId}/recommend` | `{ insurer, premium, terms }` |
| Finish quotes | `POST /api/v1/onboarding/{id}/steps/QUOTES` | `{ singleSourceReason? }` |
| Request internal approval | `POST /api/v1/onboarding/{id}/approval` | `{ commissionRate }` |
| Placement | `POST /api/v1/onboarding/{id}/placement` | Section 2 placement fields + `evidenceDocumentId` |
| Welcome | `POST /api/v1/onboarding/{id}/welcome` | `{ evidenceDocumentId }`; returns `clientId` |

**Also please return** `canUpdate: true/false` for the signed-in user.

## 9. Permissions (ONB-03)

Suggested codes: `ONBOARDING_READ`, `ONBOARDING_CREATE` (register a lead), `ONBOARDING_UPDATE` (record steps).

| Role | Read | Register a lead | Record steps |
|---|---|---|---|
| MD, DMD, Commercial Director, CRM Manager | ✓ | ✓ | ✓ |
| Accounts Executive, Client Relation Records Officer, Technical Director, GI Underwriting Manager, Risk & Compliance Manager | ✓ | | ✓ |
| Internal Audit Manager | ✓ | | |

The Risk & Compliance Manager also signs the KYC Approval Form, in Approvals.

This matches the demo rules in `onboardingPermissions` (`src/lib/permissions.ts`). Christian's change on 16 Oct lets the AE and CRM Manager add clients, which fits this table.

## Open questions for GRAL

- The KYC checklist for each client type (section 5).
- Whether lead registration belongs to the Commercial Director (as the SOP says) or also to the CRM Manager and AEs.
