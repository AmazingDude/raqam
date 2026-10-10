# Person 2 bookkeeping continuation

For the business owner preparing reviewed expenses, supplier bills and financial statements. The user authorized this continuation; reuse the accepted workflow and existing design system.

Baseline: main `d80f777`. Own `src/lib/client/bookkeeping-api.ts`, `bookkeeping-editor.ts`, `src/lib/ai/expense-note.ts`, workspace bookkeeping screens, workspace navigation wiring, AI/E2E tests and Person 2 documentation. No backend, shared contract, migration or dependency changes.

Use the existing ink `#18191b`, canvas `#f5f5f3`, surface `#ffffff`, muted `#62656b`, good `#176444` and warning `#805000` tokens; system sans typography; existing 4/8/12/16/24/32 spacing, 10px controls and 18px panels. No new imagery or motion.

Left-aligned screens:

```text
Expenses: heading / original note / explicit editable fields / save draft
          saved drafts / inspect / accept or reject
Bills:    heading / supplier + evidence / exact lines / save draft
          saved bill / confirmed received date + account / explicit approval
Books:    period / history coverage / report chooser / exact server totals
          account list / journal evidence and immutable reversals
```

The defining element is the original-note/evidence comparison and the visible incomplete-history notice. Avoid decorative controls. Missing values remain blank; accepting an expense draft does not claim cash or a journal was posted. Bill approval explains the accrual and unchanged cash. Saved invoice download remains the existing implementation.

Acceptance: validated owner-bound clients, stable retry keys, stale-write errors that preserve fields, fully manual expense/bill paths, explicit account/date/source selection, server report scope and completeness visible. Synthetic tests and strict types; responsive and keyboard checks at 360/768/1280 where tooling allows. Payment linking and tax remain blocked on APIs/policy gates; scanned layouts require named accepted fixtures. The optional expense-note model helper cannot be connected to a route until Person 1 supplies its bounded authenticated endpoint.
