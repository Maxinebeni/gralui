# Midterm demo: Leads (client onboarding)

Tue 3 Nov · presented by Maxine · about 4 minutes

**The story in one line:** GRAL's onboarding SOP has 11 steps and a 10 to 15 working-day target. A lead covers steps 1 and 2; then each policy being placed runs as its own track through steps 3 to 11. Each step has the owner the SOP names, a deadline and a document as proof, and the system enforces the controls. The key control: no quotation before the client's KYC is approved.

Sample data set up for this:

| Where | Starts at | What we show |
|---|---|---|
| **Kivu Lakeside Hotels Ltd** (lead LD-2026-009) | Steps 1–2 done; the client's KYC has 5 of 6 documents; its Property track waits at step 3 | The KYC control, done by the right people |
| **Umurage Microfinance Ltd** (track TRK-2026-016) | Step 8: approved by the TD, waiting for the MD (APR-2026-018) | Approval by commission tier |
| **Inzira Construction Ltd** (track TRK-2026-014) | Step 10: schedule received and checked by the TD | Verify and convert into the client's policy |

Dates move with the calendar, so on the day each one is at the same point.

## Before the presentation

- [ ] Run in **demo mode** (`NEXT_PUBLIC_MOCK_AUTH=true`). Real onboarding on staging also needs GRAL's KYC checklist set up and the onboarding approvals switched on (see `docs/onboarding-fields.md`).
- [ ] Have two small PDFs on the desktop: `AML questionnaire.pdf` and `KYC Approval Form.pdf` (any PDF works).
- [ ] Sign in, open **Leads** and leave it there.
- [ ] **Don't refresh the page or type addresses during the demo.** Demo data lives in the browser, so a reload puts everything back to its starting point. Use the links, buttons and the role switcher only. (That is also how to reset between rehearsals: refresh.)

## Script

**1. The Leads page (20 s), role MD**
- "Every prospect, with its progress through steps 1 and 2, and each policy track with its step."
- Point to Nyarugenge Logistics: two tracks (Motor at step 7, overdue; Marine at step 5). "One client, several policies, each on its own clock."

**2. A lead (30 s): open Kivu Lakeside Hotels**
- Steps 1 and 2 as a checklist: who assigned, confirmed, responded, the needs assessment with its three records, the prospect client.
- The **KYC** card: "Being prepared · missing the AML questionnaire. No quotation on any track until it is approved."

**3. KYC (90 s): click "Open the KYC review"**
- Switch the role to **Accounts Executive**. Next to the AML questionnaire, **File the document**, choose `AML questionnaire.pdf`, check the preview ("Is this the right file?"), **Upload**, **File it**. "The 3-working-day review clock starts from when the last document actually arrived."
- Switch to **Risk & Compliance Manager**: record the screening (**Clear**, "UN and OFAC lists, no matches", attach any PDF).
- Switch back to **Accounts Executive**: **Send for decision**.
- Switch to **Risk & Compliance Manager**: decision **Approve**, reason, attach `KYC Approval Form.pdf`, **Approve**. "Approved: quotations can go ahead on every policy track for this client."

**4. Approval by tier (40 s), role MD**
- Open **Approvals**, then "New business · Bankers Blanket Bond" (Umurage). "Commission RWF 4.65m is a Large account: the Technical Director approved, now the MD."
- **Approve**, then follow the link to the track: it moved to step 9, presentation and acceptance.

**5. The end of a track (40 s), role GI Underwriting Manager: Leads, then Inzira Construction**
- Step 10 shows the instruction, the insurer's confirmation, the schedule and the TD's check. **Verify the schedule**, then **Convert into the policy**. "Now it is a real policy: on the client file and in the renewal tracker. Coverage dates come from the schedule, never from the acceptance."

## If something goes wrong

- **A button is missing:** check the role. Each action belongs to the role the backend gives it (for example only the Technical Director records the risk survey).
- **A step won't save:** read the message out. It is usually the SOP rule doing its job (for example "Every insurer asked must be accounted for").
- **The page was reset:** go straight to part 4 or 5.
- **Only 1 minute left:** parts 2 and 3 up to "Send for decision".

## Questions we may get

- **Why can't they get quotes before KYC?** The SOP's AML control (SOP 3.2 step 3, section 9.2). The backend refuses quotes, recommendations and approval requests without current KYC.
- **Where does the KYC checklist come from?** GRAL sets it per client type in the system, with versions; the backend does not invent it. The one shown is a suggested starting list for GRAL to confirm.
- **Who approves new business?** By expected annual commission: under RWF 1m the TD; RWF 1m to 10m the TD then the MD; above that the MD, then the Board's written approval recorded by the MD.
- **Is this on the real backend?** Every screen calls the real onboarding endpoints when signed in to the backend. On staging it is waiting for two settings: GRAL's KYC checklist and the approval policies.
