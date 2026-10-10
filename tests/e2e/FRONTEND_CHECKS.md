# Frontend browser verification

10 October 2026. Local production build, Codex in-app browser. All records below are synthetic development data; no live Groq output or persisted financial decision was tested.

## Executed scenarios

| Check | Observed result |
| --- | --- |
| Initial cashbook | 6 records: PKR 92,000.00 in / 27,500.00 out / 64,500.00 net |
| Search scope | Northstar search: 1 record, PKR 0.00 in / 8,500.00 out / -8,500.00 net; scope labeled |
| CSV confirmation gate | Confirmation disabled until the preview acknowledgement is checked |
| Excess precision | `9.995` rejected with a recoverable error; no import occurs |
| Unknown import amount | Original `unknown` retained; invalid row excluded, never converted to zero |
| Confirmed example import | 2 valid rows added, 1 unresolved; 8 records: PKR 110,000.00 in / 28,950.00 out / 81,050.00 net; confirmation cannot be repeated |
| Unknown receipt total | Save reviewed fields blocked until required fields are known and PKR is confirmed |
| Source/extraction distinction | Synthetic printed total 3,250.00 remains separate from original OCR `null`; manual correction retains original unknown |
| Category acceptance/rejection | Northstar accepted, Fieldwork rejected; cash totals unchanged |
| Reviewed edits | Description/category saved in example; original description retained; review entry created |
| Ambiguous match | Two equal-amount candidates remain unselected; candidate selection alone does not enable confirmation; evidence acknowledgement is required |
| Match then document correction | Example match accepted once; changing document fields releases allocation and requests fresh review; cash totals unchanged |
| Assistant | Exact net answer across 6 records, 6 accessible CSV-row references, simulated trail; unsupported text preserves question and shows an integration message |
| Keyboard dialog | Shift+Tab wraps from first to last; Tab wraps last to first; focus ring visible; Escape closes and restores record-button focus |
| Downloaded export | Browser downloaded `raqam-example-cashbook.csv`; file inspection verified 6 records, exact amounts, original/reviewed descriptions, pending statuses and sources |
| Reset/reload | Restores original 6-record example and clears session decisions |
| Mobile navigation | Disclosure opens; selecting Documents navigates and closes it |
| Real signed-out gate | Workspace shows sign-in/example actions without example records filling the real account |

18/18 listed scenarios passed after fixes. This is a manual browser scenario count, not an AI accuracy or live-backend score. Initial search padding/header wrapping and dialog focus issues were fixed and rechecked. The first dialog implementation depended only on native modal behavior; explicit keyboard wrapping now handles the observed browser behavior.

## Layout and accessibility evidence

Landing and cashbook screenshots were inspected at 360, 768 and 1280px. Document review was also inspected. Page scroll widths stayed within viewport widths (345/360, 753/768 and 1265/1280 with the browser scrollbar). Mobile rows and controls remain reachable. Search padding is 38px after the overlap fix. Mobile landing CTA stays on one line. Decorative hero sparkle removed after the first visual review.

All inspected document-review controls had associated labels. Keyboard ring/wrapping/restoration verified. Reduced-motion media rule inspected; OS preference emulation and full assistive-technology testing were not run. Seven token pairs were calculated: ink/white 17.59:1, muted/white 5.84:1, muted/canvas 5.35:1, dark-secondary/ink 10.39:1, reviewed/background 6.48:1, pending/background 6.20:1, error/background 5.97:1. This is token-pair evidence, not a full WCAG certification.

## Command evidence

- `npm run typecheck`: passed; final production build also completed its TypeScript check.
- `npm run build`: passed after final keyboard fix. The sandbox initially blocked a Next TypeScript worker (`spawn EPERM`); the narrowly scoped build escalation succeeded.
- `npm test`: 22/22 existing financial/contract/upload/simulated database security tests passed. These do not validate live providers.
- `node tests/e2e/frontend-smoke.mjs`: passed: 3/3 UI routes and 3/3 unauthenticated private GET denials, no-store response headers.
- Git whitespace/diff checks: passed.

No lint script is configured. The earlier `smoke:platform` script asserts the former root setup page; A should adapt its homepage expectation when integrating the new landing. The frontend smoke covers the current pages and leaves that A-owned script untouched.

Local runtime note: binding Next explicitly to IPv4 `127.0.0.1` caused middleware proxy socket failures with the current localhost platform configuration. Restoring `npm run start -- --port 3000` passed the HTTP checks. A's middleware/config was not changed.

Pending: real sign-in/save/reload/account-switch, managed Supabase storage/isolation, persisted import/reviews/export, OCR/provider failure/retries, actual grounded AI and the deployed full journey. Complete these after A/C integration before closing PRD release gates.

## B-API-01 continuation, 10 October

Resumed frontend `123c642` and synchronized published backend `87aeb1a` in an isolated checkout. Existing visual direction is preserved. The following checks used `/b-checks`, a temporary development-only fixture that renders the real live components with explicitly simulated API responses. No credentials or hosted records were used. The route must be removed before the final production build; its preparation/removal helper and fixture source remain under `tests/e2e/`.

| Browser group | Observed result |
| --- | --- |
| Whole-workspace/table scope | Searching Northstar showed one row while full-workspace totals stayed PKR 64,000.00 in / 8,500.00 out / 55,500.00 movement |
| Stored preview/confirmation gate | Original valid/unknown rows and counts visible; confirmation disabled until explicit acknowledgement |
| Lost confirmation response | Simulated save then network loss froze decisions; retry reused confirmation and created one valid record |
| Excess-precision correction | `9.995` rejected locally; original unknown and unresolved outcome retained |
| Lost resolution response | Simulated save then network loss preserved the UUID/payload; retry reused the receipt and created one corrected record |
| Exact current cash | Four records after correction: PKR 64,100.01 in / 8,509.99 out / 55,590.02 movement |
| Explicit rejection | Fresh fixture rejected unknown row; 1 imported / 1 rejected / 0 unresolved; three cash records, PKR 55,600.01 movement |
| Stale-review denial | Simulated 409 preserved reviewed description/category draft; save and comparison disabled until latest record loaded |
| Conflict comparison/history | Loaded another client's description; draft preserved; explicit comparison enabled save at version 2, original description retained and history visible |
| Summary unavailable | All three totals displayed Unknown, with retry; records remained visible |
| Export failure/recovery | Failure remained in recoverable dialog; successful browser CSV inspected: four records, exact amounts, original/reviewed descriptions, accepted category and pending match status |
| Keyboard dialog | Tab from final history control wrapped to Close; Escape closed dialog; visible focus ring inspected |
| Private-screen remount | UI state remounted; reopening record loaded saved fixture version/history. This is simulated API state, not cloud persistence/account isolation |
| Responsive navigation/forms | 360px menu opened/navigated/closed; CSV correction fields reachable; 360/768/1280 screenshots inspected |

14/14 groups passed. Page width checks were 345/360 and 1265/1280 with scrollbars; tablet dialog stayed within its 768px viewport. Screenshots are local session artifacts outside Git. No new imagery/colors/decorative element was added; existing token/focus/reduced-motion rules are retained. Native account switching, session expiry, actual concurrent browsers and live product persistence remain untested by B in this continuation.

Command evidence: financial/security suite 37/37; `node --test tests/e2e/client-api.test.ts` 4/4 (exact summary/scope validation, malformed/auth/conflict responses, stable resolution retry commands/signals and verified export errors). Final `npm run typecheck` and production build pass; temporary route absent from build and HTTP 404 confirmed. Production HTTP smoke passes 3/3 UI routes and 9/9 signed-out private GET denials. This isolated checkout has no provider configuration, so private denials are fail-closed 503 responses, not fresh live-session evidence. B's whitespace check passes. The imported backend has two pre-existing blank-at-EOF warnings in migrations 004/005; these files remain byte-identical to the published backend. No lint script exists.

Environment: pinned `npm ci --prefer-offline --no-audit`; local Node 24.11.1. Next's stale generated development validator still referenced the removed fixture on the first final typecheck; clearing only that generated validator/routes pair resolved it. Final production checks ran after the last source fix. Live credentials and API/session integration were not copied from the original checkout.
