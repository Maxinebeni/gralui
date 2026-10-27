# Lead onboarding and shared KYC API

All endpoints use the existing internal SESSION cookie, current Business permissions, CSRF on mutations, no-store responses and server-generated X-Correlation-ID. Generated /v3/api-docs is authoritative.

## Identity and policy tracks

POST /api/v1/leads creates a lead, not coverage. CRM assigns an AE using /leads/{id}/assignment; Commercial Director confirms registration through /confirm-registration. The assigned AE records /record-response and /assessment, then /link-client or /prospect.

Prospect creation reuses client required fields and duplicate-review fingerprints/reasons. Client detail adds acquisitionStatus: PROSPECT or CLIENT. Existing clients remain CLIENT without implying historical verification.

POST /leads/{id}/onboarding-cases starts an independent policy track. Several tracks may share one lead/client and current approved KYC. Input names the product and GI_UNDERWRITING_MANAGER or MEDICAL_UNDERWRITING_MANAGER; renewalProfile defaults to STANDARD. property=true enables the mandatory asset-list gate.

GET /leads, /leads/{id}, /onboarding-cases, /onboarding-cases/{id} and /leads/{id}/onboarding-cases return currently visible resources. Lists filter scope before counts/paging. /history retains attributed command metadata under current visibility.

## Command envelopes and evidence

Plain commands use commandId, expectedVersion and an optional reason. Nested commands use a command object containing those fields. Keep the same command ID and original payload/version for an identical retry; changed key reuse conflicts. A successful retry returns the recorded revision under current authorization, even when later commands have advanced the resource; historical results have no availableActions. Do not automatically retry a stale edit with a newer version.

Evidence commands contain command, documentId, documentVersion, occurredAt and optional detail. Compound commands place this envelope under evidence. Files must already be exact READY versions linked to LEAD, ONBOARDING or KYC with the exact consuming purpose. Uploading a later version never silently replaces signed/accepted evidence.

## Track operations

All suffixes below follow /api/v1/onboarding-cases/{id}.

| POST suffix | Meaning / evidence purpose |
| --- | --- |
| qualify-kyc | Requalify shared current client KYC |
| assignment | Assign OWNER, TECHNICAL or UNDERWRITING responsibility |
| risk-survey | Corporate report/grade/findings; RISK_SURVEY |
| risk-survey-not-applicable | Individual applicability with reason |
| program | TD-signed program; PROGRAM / APPROVAL_EVIDENCE |
| insurer-license | Dated licensing source; INSURER_LICENSE_ plus insurer UUID without hyphens |
| request-single-source | Justification evidence SINGLE_SOURCE; TD/MD approval |
| dispatch-rfq | RFQ evidence, distinct insurerIds and explicit responseDue |
| insurer-response | DECLINED or elapsed NO_RESPONSE with recorded explanation |
| quotes | Immutable revisions of explicit insurer/product, dates, premiums, commission, limits, sums insured, deductibles, exclusions and support |
| recommend | Exact quote/version, annualCommissionRwf, calculation basis, comparison, rationale and RECOMMENDATION evidence |
| request-approval | Current recommendation tier and revision; existing approval inbox/decisions |
| revise | Reasoned pre-placement revision; obsolete approval work is withdrawn |
| record-board-approval | MD records Board proof after MD review; BOARD_APPROVAL / APPROVAL_EVIDENCE |
| record-presentation | CLIENT_PRESENTATION after qualified approval |
| record-client-acceptance | CLIENT_ACCEPTANCE purpose and classification |
| property-assets | PROPERTY_ASSET_LIST before property placement |
| place | Formal insurer instruction; PLACEMENT |
| confirm-placement | Insurer confirmation; PLACEMENT_CONFIRMATION |
| receive-schedule | POLICY_SCHEDULE classification, SCHEDULE purpose, externalPolicyNumber and observed terms/discrepancies |
| technical-verification | TD proof POLICY_TECHNICAL_APPROVAL / APPROVAL_EVIDENCE |
| verify | Underwriting final verification of the matching schedule |
| convert | Explicit amountPaid; unique issued policy/period, client conversion and renewal enrollment |
| complete-welcome | WELCOME_LETTER, POLICY_DELIVERY and FILE_CHECKLIST evidence |
| disposition | Reasoned ON_HOLD, RESUME, CLOSED_LOST or CANCELLED |
| deadline | Explicit reasoned adjustment of an open milestone |

Three invitations do not mean three replies. Staff must account for each invitation. Two usable replies can proceed; one usable reply needs the MD-approved exception. Licensing and current KYC are rechecked at controlled actions.

Annual commission tiers use explicit RWF observations: below 1,000,000 requires TD approval; 1,000,000 through 10,000,000 requires TD then MD; above 10,000,000 requires MD review followed by written Board approval recorded by MD. Board metadata identifies BOARD_OF_DIRECTORS as the authority and separately retains the recording operator, recording/decision dates, evidence and material revision. There is no Board login. Revised material terms require fresh recommendation, approval and acceptance.

Written acceptance does not create coverage. Convert only after verified placement. The result contains policyId, policyPeriodId and renewalId; stage 11 remains open for welcome work. Claims use the exact period and loss-date validation. Coverage dates come from accepted/verified insurer terms, never the acceptance date.

## KYC

Onboarding policies and editable DEFAULT_INDIVIDUAL / DEFAULT_CORPORATE checklists are
migration-seeded. Individual documents: identity document and completed KYC form.
Corporate documents: registration certificate, tax identification, completed KYC form
and beneficial-owner/director identification. All are required; manual screening and
signed compliance approval remain mandatory. Append template versions to reconfigure.

POST `/api/v1/kyc-cases/{id}/assignment` accepts `commandId`, `expectedVersion`,
`assigneeId` and required `reason`. CRM/MD with KYC_ASSIGN selects one active eligible
Risk & Compliance reviewer. KycView exposes `reviewerId`. Submission without an eligible
reviewer conflicts with NO_ELIGIBLE_KYC_REVIEWER; screening and decisions require that
reviewer. Reassignment replans pending tasks/notices in the same transaction.

For restricted prospects, CRM/MD assigns TECHNICAL and UNDERWRITING through the track
assignment endpoint. Specialists can access their assigned track or KYC case, necessary
identity data within its commands and authorized evidence. This grants neither general
client access nor sibling-track access nor raw KYC access to underwriters. Reassignment
or completion/closure removes scoped access. Refresh after assignment: case and pending
approval versions can advance, and obsolete reviewer tasks/notices are cancelled.

PUT /api/v1/kyc-templates/{code} appends a checklist version with expectedVersion, clientType, requirements and reason. It requires KYC_POLICY_UPDATE. Requirements have code, label and required. Templates are approved operational inputs, not automatically supplied defaults.

POST /api/v1/kyc-cases accepts commandId, clientId and templateCode. For a case:

- PUT /requirements/{code} attaches exact KYC-classified evidence for that requirement purpose and the actual receivedAt timestamp.
- POST /record-screening records manual CLEAR, REVIEW_REQUIRED or REJECTED observations with SCREENING evidence.
- POST /submit requests compliance review after required documents arrive.
- POST /decisions records APPROVE, RETURN or REJECT with a reason. Approval requires a clear screening result, the reviewed identity/template and KYC_APPROVAL evidence classified APPROVAL_EVIDENCE.
- POST /escalate records written KYC_ESCALATION evidence, a reason and revisedDueAt after the original review deadline has elapsed. The original deadline remains in history and the summary.

The three-working-day review clock starts from the latest actual receipt of all required documents, rather than data-entry time. Eligible RC reviewers receive controlled tasks; decisions settle their sibling tasks. Replanning retains prior task history.

GET /kyc-templates lists the current versions. GET /clients/{id}/kyc-readiness and /kyc-summary give safe gate/progress results without screening notes or document references. GET /kyc-cases/{id}, /clients/{id}/kyc-cases and /kyc-cases/{id}/history require raw KYC access and inherited client visibility; AE preparation access requires the current client portfolio. A new review or changed reviewed identity/template prevents reuse of an obsolete approval.

## Blockers and operating boundaries

Missing evidence, wrong stages, stale versions and unavailable approval/template configuration are explicit conflicts. availableActions is advisory; application commands repeat all checks.

Client/insurer emails, signatures and screening remain manual. The platform records evidence of those actions.
Live approvals default enabled in every environment. Explicit APPROVAL_LIVE_ENABLED=false
disables live requests, decisions, actionable inboxes and approval consumption. Four
onboarding policies are supplied; no renewal policy is seeded. 

## Review corrections (ADR-028)

Final standard/large approval now advances the onboarding version and immediately creates
the AE acceptance task. Refresh the case after approval. Written acceptance opens a dated
underwriting placement task immediately. License checks can be refreshed in stages 6?10
using the existing license endpoint (available action LICENSE), including after placement.
Held cases allow owner reassignment; tasks remain paused until RESUME. Current KYC is
required for quote, recommendation and approval-submission commands.
