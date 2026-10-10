# Chatbot bookkeeping actions

Status: approved by the user and implemented locally; hosted migration and live provider/end-to-end verification remain pending.

## Goal and audience

Subject: extend Ask Raqam into a conversational editor for a business's cashbook and a way to enter past transactions in plain language.
Audience: a small Pakistani service-business owner who wants to maintain PKR books without entering every row through forms.

The user clarified that historical transactions are written directly in chat; document uploads are not required for this feature. Preserve uploaded statements as original evidence. Changes to bank-statement entries affect their imported cashbook records. Financial statement figures remain derived from validated ledger entries, never directly overwritten by model output.

## Interaction

Maintain a conversation across questions and reloads, scoped to the signed-in workspace. Accept one or several historical transactions in a message. Extract draft dates, descriptions, directions, exact PKR amounts, references and categories. Ask for missing dates, years, amounts, payment status or ambiguous target records. An unpaid bill is not a cash payment; retain it as a draft or route it into the existing bill/invoice workflow.

Display a compact before/after proposal for edits or a transaction list for new history. The owner can say “save these” or press Save changes once for the batch. A response listing a proposed edit must not claim it was already saved. Applying a batch uses a persisted, owner-scoped proposal ID, not client-supplied arbitrary writes. Retries must return the saved result instead of duplicating transactions. Refresh the cashbook and relevant reports after saving.

A financial correction to an already posted journal requires reversal/replacement through validated ledger operations. Show the affected statement lines; do not set profit, assets or bank balance directly. Missing classification or recognition information requires clarification before posting. Preserve original transaction descriptions, source evidence, and previous/current values in the existing audit history.

## Visual tokens

Reuse the current workspace system: ink #18191b, canvas #f5f5f3, surface #ffffff, muted #62656b, success #176444, error #b42318. System sans for UI; tabular numerals for money. Spacing 4/8/12/16/24/32/48 px. Existing 10 px controls and 18 px panels; pill radii only for established buttons/badges. No entrance animation; existing short state transitions honor reduced motion.

## Layout

Desktop, left aligned:

    Ask Raqam                     [New conversation]
    [Conversation list] | Owner message
                        | Raqam answer / clarification
                        | Changes to save
                        | Record    Before -> After
                        | [Save changes] [Discard]
                        | Saved result + View history
                        | [Message input] [Send]

Mobile, left aligned:

    Ask Raqam [Conversations]
    Message history
    Change proposal (stacked fields)
    [Save changes] [Discard]
    [Message input] [Send]

The distinctive element is the plain before/after record comparison with code-formatted exact money and source labels. It communicates the work being done instead of adding decorative chat cards. Keep the existing page/navigation styling. No new images or generated assets are needed for this accounting interaction.

## Implementation boundaries and files

1. Freeze new chat/conversation/proposal/action contracts in src/lib/contracts; update confirmed scope in PRD and task ownership only after this plan is approved.
2. Add the next available migration for owner-scoped conversations/messages, persisted proposals, honest manual-entry sources, versioned corrections and idempotent atomic application. Check hosted migration prerequisites separately; never fabricate an uploaded-file source for a chat entry.
3. Add a bounded server action planner in src/lib/server/assistant using existing provider adapters and BYOK selection. Keep the existing grounded read-only engine for questions. Treat transaction descriptions, previous messages and imported document text as data, not instructions granting permission to change records.
4. Use existing owner checks, exact-money validation, audit records and ledger posting rules. Revalidate target IDs and versions at application time. Reject foreign-workspace IDs, stale targets, conflicting matches, unbalanced journals and unsupported actions. Permit no arbitrary SQL, payments, external messages or silent deletion.
5. Add authenticated chat/history/proposal application endpoints beneath src/app/api/assistant and client methods in src/lib/client/api.ts. Persist chat messages and pending proposals; do not store private conversation content in localStorage. Enforce bounded message sizes, pagination, provider budgets and cancellation.
6. Update assistant-screen and its workspace integration for conversations, clarifications, proposed actions, batch saving, saved/failed states and refreshed books. Account switching clears the previous owner's visible conversation immediately.
7. Add meaningful service, database/security, provider-planning and client tests. Verify owner isolation, typed historical entries, exact money, ambiguity, stale versions, audit history, retries, atomic batches and totals/report recalculation. Run typecheck/build and inspect the UI at 360/768/1280 px. A mocked planner does not establish live model accuracy; synthetic live provider checks are separate.

## Acceptance

- “On 2026-09-01 I paid rent of PKR 30,000, and on 2026-09-02 a client paid PKR 75,000” produces two manual-history drafts; one explicit save persists them once and totals are calculated by code.
- A missing year or whether an amount was paid triggers a clarification, including across conversation reloads.
- “Change that rent payment to PKR 32,000” identifies the exact record from saved context, shows 30,000 -> 32,000, and saves with version and audit checks.
- A stale/foreign record or injected instruction in existing source text cannot authorize a write.
- Statement-row corrections preserve the uploaded original. Ledger statement changes come from balanced posted corrections and reconcile with the ledger.
- Chat/audit history and books persist across reloads; retrying a saved operation does not create duplicates.
- Keyboard focus, accessible labels/status/errors, contrast, responsive layout and account-switch isolation are verified.

## Review of visual defaults

The plan uses the existing workspace palette and components, not a new generic chat theme. The comparison layout carries accounting information. Decorative imagery, gradients and unrelated animations are unnecessary.
