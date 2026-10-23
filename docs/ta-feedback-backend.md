# Back-end checks from the TA's feedback

From Maxine (front end) to Toochukwu · 21 Oct 2026

Our TA's feedback said that typing mistakes in money figures and wrong uploads were not caught, and that the Overview showed everyone everything. The front end now handles all three. This note covers what the **back end** needs so the protections are real, not just on screen.

## 1. Overview: summary data only for people who can see it

The Overview now shows each tile and card only if the person can open that page (claims, renewals, clients, leads, approvals), and only loads the data it shows. The back end should refuse the same way: claim summaries and monthly figures need `CLAIM_READ`, renewals need `RENEWAL_READ`, and so on. Clients already work like this. The activity feed should also only return entries from modules the person can read.

## 2. Money figures: the same checks on the server

The forms show amounts grouped and in words, and a "check before saving" step lists unusual figures. Those warnings are soft (the person ticks that they checked). The **hard** rules must also be on the server:

- the premium is not more than the sum insured
- the net premium is not more than the total premium
- amounts are whole RWF, greater than 0
- the renewal date is after the start date
- a claim settlement is approved through Approvals

Corrections to saved money figures should keep the old value, who changed it and why (audit), never overwrite silently.

## 3. Uploads

The front end now shows a preview ("Is this the right file?", with where it is going) before anything is uploaded. Server side, nothing changes, but please keep **Replace** as a new version (as the document API already does), so a wrong file can be corrected without losing the history.
