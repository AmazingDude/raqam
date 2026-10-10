# Landing-page review: Alisha's commit `9644cdc`

**Reviewer:** GPT-6
**Reviewed:** 10 October 2026
**Scope:** `9644cdc` — “Enhance marketing landing page with interactive sandbox preview and rich aesthetics”
**Method:** Static code review against `DESIGN.md`, the frontend handoff, and Raqam's review and money semantics. No tests or build were run.

This review was produced by GPT-6, not GPT-6 Luna.

## Findings

### [P2] Recalculate totals when filtering rows

[`landing-preview.tsx:127`](../../src/components/marketing/landing-preview.tsx#L127)

The filter changes the visible rows, but these summary amounts stay hard-coded for all five records. The approved design says the example summary follows its filtered rows, so the totals become misleading as soon as someone selects Reviewed or Needs Review.

### [P2] Do not label mixed-status outflows verified

[`landing-preview.tsx:132`](../../src/components/marketing/landing-preview.tsx#L132)

This total includes the Northstar and fiber rows, both marked pending in `MOCK_ROWS`. The Verified badge suggests those records have passed review; label the amount as recorded or show review status separately.

### [P2] Make the evidence mode change the content

[`landing-preview.tsx:220`](../../src/components/marketing/landing-preview.tsx#L220)

Selecting Raw Model Output only changes which button looks active; the displayed fields never read `evidenceMode` and remain in the verified-looking state. Render distinct raw and reviewed values, or remove this selector.

### [P2] Complete the accessible tab pattern

[`landing-preview.tsx:78`](../../src/components/marketing/landing-preview.tsx#L78)

These controls expose tab roles and selection state, but there are no tab-to-panel IDs or `aria-controls`, no `tabpanel` role, and no arrow-key or roving-focus behavior. Add those relationships and keyboard interactions so the preview works as a tab set for assistive-technology and keyboard users.

### [P2] Meet the approved touch-target and focus sizes

[`landing.module.css:340`](../../src/components/marketing/landing.module.css#L340)

The tab buttons render at roughly 27px high, while the filter and evidence buttons force 32px and 28px heights. `DESIGN.md` requires 44px touch targets and a high-contrast focus ring; bring these controls up to that spec.

### [P2] Qualify unverified capability claims

[`landing.tsx:212`](../../src/components/marketing/landing.tsx#L212) and [`landing.tsx:287`](../../src/components/marketing/landing.tsx#L287)

“Zero hallucinated math” is an absolute guarantee, and the FAQ also claims support for exports from all commercial banks and named wallets. The repository does not establish those blanket claims with matching evaluation or provider-specific import evidence; describe the code-enforced behavior and verified import coverage instead.

## UI refresh disposition — 10 October 2026

The landing preview now recalculates cash totals from the filtered rows with integer-paisa arithmetic, labels cash activity separately from review status, and presents different source values for original extraction and reviewed details. Its tabs have tab/panel relationships, roving focus and arrow/Home/End keys. Navigation is keyboard-operable, touch controls meet the 44px design target, focus indicators and reduced-motion behavior are explicit, and the unverified capability claims were removed or qualified. The workspace/auth shell also received a responsive layout and shared component polish.

The production build and browser interaction were checked after implementation. Regression checks passed: 154/154 repository tests, strict typecheck, production build, 6/6 client API tests, 3 public/UI route checks, 9 signed-out private GET denials and 27 signed-out platform request denials. This disposition addresses the findings above; it does not establish live provider or signed-in financial workflow coverage.
