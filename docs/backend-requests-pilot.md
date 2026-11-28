# Backend requests from the pilot (28 Nov 2026)

The GRAL team asked for these at the pilot. The frontend is built and works in
demo mode. On the live system each screen waits for the routes below; until
they exist it says the feature is not on the live system yet. All money is RWF.
Commands use the usual `{ commandId, expectedVersion, reason }` envelope.

## 1. Premium payments and instalments on a policy period

Screen: policy page, Payments card.

```
GET  /api/v1/policy-periods/{periodId}/payments
  -> { instalments: [{ number, dueDate, amount }],
       payments:    [{ id, paidOn, amount, method, reference, instalmentNumber?,
                       receipt: { fileName, documentId, version }, recordedBy, recordedAt }] }

PUT  /api/v1/policy-periods/{periodId}/instalments
  { instalments: [{ dueDate, amount }], currency: "RWF", reason }
  The amounts must add up to the period's total premium.

POST /api/v1/policy-periods/{periodId}/payments
  { amount, currency: "RWF", paidOn, method, reference, instalmentNumber?,
    receiptDocumentId, receiptDocumentVersion }
```

- `method`: `BANK_TRANSFER`, `MOBILE_MONEY`, `CHEQUE`, `CARD` or `CASH`.
- `reference` and the receipt are required.
- The frontend first uploads the receipt to the policy with classification
  `CORRESPONDENCE` and purpose `PROOF_OF_PAYMENT`, then sends its id and version.
- Recording a payment should update the period's `amountPaid`, so the balance,
  the payment terms status and the outstanding report all agree.
- Suggested permission: `POLICY_PAYMENT_RECORD`. Until it exists the frontend
  also accepts `POLICY_FINANCIAL_UPDATE`.

Already working with no backend change: invoices, contracts and receipts are
uploaded to the policy with purposes `INVOICE`, `CONTRACT` and
`PROOF_OF_PAYMENT`.

## 2. Skipping renewal steps and restarting a renewal

Screen: renewal case, Milestones tab. The Risk and Compliance Manager decides.

```
PUT  /api/v1/renewals/{id}/not-needed
  { commandId, expectedVersion, reason, milestoneCodes: ["VISIT", "NOTICE", ...] }
  Replaces the set of steps not yet done that are not needed. COMPLETION cannot be skipped.

POST /api/v1/renewals/{id}/restart
  { commandId, expectedVersion, reason }
  All milestones back to not started. Quotes stay; recommendation and acceptance are cleared.
```

- A milestone marked not needed comes back with status `NOT_NEEDED`.
- When the renewal reaches it, it becomes `SKIPPED` (already read as finished).
- Both routes return the renewal view, like the other renewal actions.
- Suggested permissions: `RENEWAL_STEP_SKIP` and `RENEWAL_RESTART`, for
  RISK_COMPLIANCE_MANAGER.
- The pilot asked for this to be pre-set for every renewal of a kind (for
  example individuals). A default per client type can come later; this covers
  one case at a time.

## 3. Reimbursement number on Life and Medical claims

Screen: New claim form, for Medical and Life classes.

- Add an optional `reimbursementNumber` (text, up to 60) to `POST /api/v1/claims`.
- Return it on the claim view.
- The frontend already sends it. Until the server stores it, it is kept only in
  the browser that registered the claim.

## 4. Endorsement number

No backend change needed. The policy edit form has an "Endorsement number"
field. It is saved at the start of the change reason (for example
`Endorsement END-02: two vehicles added`), so it shows in the policy history.
A separate field on the policy movement would be better later.

## 5. Reports

No backend change needed. All business now has the period filter and premium
share by Medical, Life and Non-life. The new Outstanding payments report uses
each policy's total premium and amount paid. Every report downloads as Excel or
CSV, and All business downloads the full policy list.
