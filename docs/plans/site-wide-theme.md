# Site-wide grey theme

## Subject and audience

Raqam is a bookkeeping workspace for small service-business owners reviewing private financial records. Preserve existing routes, copy, API calls, accounting rules and draft decisions; make marketing, workspace, invoices, tax and account pages feel like one product.

## Design direction

User refinement: selected navigation uses dark emerald `#074f40` with `#f2f7f3` labels in both appearances; unselected navigation keeps its normal grey surface. Use separate selection tokens so hover/skeleton backgrounds stay neutral.

Use Ask Raqam's grey appearance throughout the site, defaulting to dark, with an explicit light-theme button per the user's request. Save only the appearance preference locally. Initialize it before paint and synchronize tabs. This explicit requested control overrides the skill's native-platform preference for system-only appearance.

| Role | Dark | Light |
| --- | --- | --- |
| Canvas | `#191b19` | `#f6f5f1` |
| Surface | `#222522` | `#ffffff` |
| Content | `#f1f0ec` | `#1c1c1a` |
| Secondary content | `#b5b9b2` | `#5c605b` |
| Brand/action signal | `#86c9a2` | `#176444` |
| Separator | `#3b403b` | `#deded8` |

Compute AA contrast from actual tokens, including status labels. Use a separate stronger border for interactive fields and a visible keyboard ring.

- Typography: one Apple/system sans stack; body 16px/1.6, utility 13–14px/1.5, workspace titles 28–36px/1.2, landing display 40–76px/1.08. Tight tracking belongs on large headings, not body text. Use tabular numerals for money.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96px. Increase separation between task groups rather than boxing every item.
- Shape: 10–12px fields, 18–24px panels, pill actions, 44px minimum control targets.
- Motion: 180ms ease-out interaction feedback; no page-wide theme animation. Respect reduced motion and increased contrast. Use opaque surfaces rather than blur.
- Signature: the transparent emerald-and-gold R emblem anchors a restrained ledger interface. Remove the rainbow AI orb/border; retain task/status distinctions through labels and semantic colors.
- Assets: reuse the existing transparent R asset. No generated imagery is needed.

## Layout

```text
Regular:  R logo | primary navigation                Theme | account/actions
          sidebar | title + quiet task controls
                  | aligned records, evidence and review panels

Compact:  R logo | Theme | navigation drawer
          title / actions wrap in reading order
          single content column; wide invoice data scrolls inside its panel
```

Keep the user's latest chat composition: borderless composer above the scrolling message thread. Theme changes do not alter that order.

## Apple Design review

Applicable web principles: `accessibility.md › Vision` (text contrast, text scaling), `layout.md › Visual hierarchy` (group related content), `typography.md` (clear type roles), `color.md` and `dark-mode.md` (semantic/adaptive colors), `buttons.md` (clear controls), `motion.md › Best practices` (optional, purposeful motion), `sidebars.md` and `cross-platform.md` (adapt layout without copying native-only conventions).

The palette is an extension of the requested Raqam chat, not a new visual template. Keep existing content hierarchy and data sources. Published/previewed invoice documents retain their paper rendering; surrounding editor and controls adopt the selected appearance.

## Verification

Typecheck, production build, existing backend/security tests, token contrast checks and preference behavior checks. Audit scoped CSS for leftover hardcoded UI colors. No browser/GUI/screenshot verification, per the user's standing instruction. Stop all task servers/background processes when finished.

## Implementation record

Implemented locally. Preference initialization/error handling and both palettes pass four CLI tests; backend/security passes 206/206. Body text/surface: dark 13.58:1, light 17.07:1; secondary text/surface: dark 7.78:1, light 6.40:1. Status/action pairs also meet 4.5:1, and field boundaries meet 3:1. Generated demo HTML includes the early preference script and accessible toggle. All stylesheet variables resolve. Typecheck and production build pass. GUI and signed-in widget interaction remain for user inspection.
