# Invoice pipeline repair

10 October 2026. The user authorized review and repair of the existing invoice implementation, including AI generation and a text-only composer. This narrow repair does not accept the broader bookkeeping/payment/tax expansion plans.

## Findings and changes

- The dashboard crash came from treating the `{data,error}` response envelope as the invoice list. Invoice clients now use the shared validated request adapter. Malformed lists and records become visible errors instead of `undefined.filter` crashes.
- Original saves ignored missing tables and item-write failures, replaced line items with separate requests, and used the wrong client-contact column. Migrations 011/012 provide atomic, owner-scoped invoice/header/item operations, exact string money, optimistic versions and immutable audit history. Failed changes roll back. Invoice writes never insert cashbook transactions.
- Money uses integer minor units and quantities with at most two decimals. Each line rounds half up; editor, proposal and SQL agree. Overflow and excessive discounts reject. Summaries use the workspace currency; the chart uses actual invoice data for the displayed issue-date period. Owner-recorded paid status is distinct from verified bank cash.
- AI now uses the configured Groq/Gemini text provider and validated structured output. Removed the regex fallback that could interpret payment terms as money and invent zero-valued lines. Null fields remain unknown/unchanged. Suggestions cannot set ownership, invoice identity or status and require a separate save.
- Groq rejected nested nullable unions with HTTP 400. Every structured-output field is now required, nullable unions are flat, and item fields have no optional identities. The request schema is checked recursively in regression tests. Primary reference: [Groq structured outputs](https://console.groq.com/docs/structured-outputs).
- Invoice AI allows one provider attempt per action, a 25-second operation deadline and a per-process UTC daily limit of at most 20 attempts. `INVOICE_AI_DAILY_REQUEST_LIMIT` can lower/disable it. Counters reset on restart and are not a provider-wide billing limit. There are no automatic retries. Eve is used elsewhere for decisions; it does not generate invoice text.
- The composer contains a text input and a labelled Draft invoice button. Voice, attachments, waveform and expansion controls were removed. Export cashbook is hidden on Invoices. Save is labelled honestly; unsupported media/customization controls are removed or unavailable. Email delivery, reminders, payment collection and a tracked public invoice portal are not implemented by this repair.

## Verification

- Focused invoice persistence, arithmetic, provider-schema/failure, embedded PostgreSQL ownership/rollback/audit, invoice-client and existing client tests: **20/20 pass**. TypeScript passes.
- Embedded PostgreSQL applies the real workspace spine plus migrations 011/012 with simulated JWT claims; it is not a hosted multi-user mutation test. Checked precise amounts beyond JavaScript's safe integer range, failed item replacement, stale versions, foreign-owner and anonymous denial, cascading deletion with retained audit, and unchanged cashbook record count.
- Live Groq probe: two rejected schema requests during diagnosis, then one successful synthetic completion (one attempt, 2.59 seconds, 2,998 total tokens). Values/totals were checked in application code; no invoice was persisted. No Eve request was made.
- Signed-in browser: invoice list loads without the filter crash, blank-client save displays an error while preserving the editor, export is absent on Invoices, and the text-only example request completed. The running Next route returned HTTP 200 for invoice AI after the schema repair. No hosted invoice save, status mutation or deletion was performed by this task.

Final integration through published main `0e6b8eb`: **146/146 backend/security tests**, **9/9 client tests**, strict TypeScript, whitespace and local documentation links pass in the isolated integration checkout. The active app and unsaved editor state were left on the repaired task checkout; integration did not replace the running workspace files. No production build was run against its shared `.next` output.

## Setup and remaining gate

Apply only pending invoice migrations in order: 011 creates the invoice tables; 012 adds atomic functions and versions. Do not reapply completed migrations. AI-only prompt/UI changes do not require rerunning SQL. Restart/reload the app after code changes if an older response remains visible.

Still verify user-confirmed hosted create/edit/status/delete/reload and two-owner browser isolation on representative invoices. Browser PDF printing is available, but invoice email delivery, reminders, actual payment capture and broader bookkeeping expansion remain separate work.
