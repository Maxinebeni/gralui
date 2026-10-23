# Midterm demo: Leads (client onboarding)

Tue 3 Nov · presented by Maxine · about 3 minutes

**The story in one line:** GRAL's onboarding SOP has 11 steps and a 10 to 15 working-day target. The platform tracks every step, gives each one an owner and a deadline, and enforces the SOP's controls. The key control: no quotation before the KYC Approval Form is signed.

Two sample leads are set up for this:

| Lead | Where it starts | What we show |
|---|---|---|
| **Kivu Lakeside Hotels Ltd** (ONB-2026-006) | Step 3, KYC: 5 of 6 documents in, only the signed AML questionnaire missing | The KYC control and the approval |
| **Inzira Construction Ltd** (ONB-2026-002) | Step 10, placement: quote approved and accepted by the client | The end of the journey: the client file opens |

Dates in the sample data move with the calendar, so on the day each lead is at the same point.

## Before the presentation

- [ ] Run in **demo mode** (`NEXT_PUBLIC_MOCK_AUTH=true`) unless the onboarding back end (ONB-01 to ONB-06) is connected by then.
- [ ] Have two small PDFs on the desktop: `AML questionnaire.pdf` and `Policy schedule.pdf` (any PDF works; a third, `Welcome letter.pdf`, for the last step).
- [ ] Sign in, open **Leads** and leave it there.
- [ ] **Don't refresh the page or type addresses during the demo.** Demo data lives in the browser, so a reload puts every lead back to its starting point. Use the links and buttons on the page only. This is also how to reset between rehearsals: refresh.

## Script

**1. The Leads page (20 s), role MD**
- "Every prospect GRAL is onboarding, with how many working days it has taken against the 15-day target."
- Point to the **Step Overdue** tile and the red card (Nyarugenge Logistics, quotation request overdue).

**2. A lead's page (30 s): open Kivu Lakeside Hotels**
- The tracker: 11 steps in four stages (Meet, Assess, Quote, Close). "Each step has the owner the SOP names and its deadline."
- Click a finished step (Meeting) to show what was recorded, and a later step (Quotation request) to show it is locked: "this step opens once step 2 is complete."

**3. The KYC control (60 s), on step 3**
- Show the checklist: 5 received, the AML questionnaire missing, and **Send for KYC approval** is disabled with the reason.
- **Upload** `AML questionnaire.pdf`. The preview opens ("Is this the right file?", with where it is going): "we check the file before it is stored." Then **Upload**.
- Record the screening: **Clear**, note "UN and OFAC lists, no matches", then **Record screening**.
- **Send for KYC approval.** "It goes to the Risk & Compliance Manager, who signs the KYC Approval Form."

**4. The approval (40 s)**
- Switch the role (top right) to **Risk & Compliance Manager**. The bell shows the new request.
- Click the request number in the "Waiting for the Risk & Compliance Manager" box (or open **Approvals** and pick the KYC Approval Form for Kivu Lakeside).
- "Approve" is already selected as the decision; click the blue **Approve** button under the comment box.
- Go back to the lead (the link in the request). Step 3 is done, and step 4 (Risk survey, Technical Director) is now current. "Quotations are only allowed from here on."

**5. The end of the journey (40 s), role MD: open Inzira Construction**
- The tracker shows 9 steps done. On **Policy placement**: policy number `RAD/CAR/2026/0412`, class Contractors All Risks, cover dates, attach `Policy schedule.pdf`, **Record placement**.
- On **Welcome & filing**: attach the welcome letter, then **Send welcome and open client file**.
- Click **Open client file**: the new client with its policy. "From here it joins the renewal tracker, so next year's renewal starts on its own."

## If something goes wrong

- **A step won't complete:** read the message out. It is usually the SOP rule doing its job (for example "Attach the record for this step").
- **The page is reset:** open Inzira Construction and do part 5 only.
- **Only 1 minute left:** do parts 2 and 3 only, and stop at "Send for KYC approval".

## Questions we may get

- **Why can't they get quotes before KYC?** It is the SOP's AML control (SOP 3.2, step 3, and section 9.2). The back end will enforce it too.
- **Where does the KYC checklist come from?** It changes per client type. The SOP names the core documents; the rest is provisional until GRAL confirms it.
- **Who approves the new business?** The same commission tiers as renewals: under RWF 1M the Technical Director, up to RWF 10M the MD, above that the MD with the Board informed.
- **Is this on the real back end?** Say exactly what is connected on the day (see the Extra Sprint tasks ONB-01 to ONB-06).
