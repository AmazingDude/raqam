# Tax workpaper and Ask Raqam layout plan

## Subject and audience

- **Subject:** An evidence-led Pakistan income-tax workpaper screen and a focused bookkeeping chat workspace.
- **Audience:** Small-business owners who need to review tax-readiness gates and write or correct cashbook history without navigating a cluttered chat page.

## Tokens

Keep the current Raqam design system and use its tokens consistently:

- **Colors:** ink `#18191b`, canvas `#f5f5f3`, surface `#ffffff`, muted `#62656b`, border `#dfe1e3`, verified green `#176444`.
- **Type:** system sans-serif for all interface text; use size and weight for hierarchy.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64 px.
- **Radius:** 10 px controls, 18 px major panels, pills only for compact status labels.
- **Motion:** no ambient animation; short state transitions only, honoring reduced motion.

## Layout

**Tax workpaper, desktop:**

```text
Page title + tax year                         Draft status
Evidence gate summary (full width)
┌─────────────────────────────┐ ┌────────────────────────────┐
│ Readiness checklist         │ │ Draft contents / actions   │
│ status + concise evidence   │ │ generated workpaper preview│
└─────────────────────────────┘ └────────────────────────────┘
```

Align to the workspace content column. On narrow screens, stack the checklist before the draft, prevent horizontal overflow, and keep each status readable without squeezing labels.

**Ask Raqam, desktop:**

```text
Page title + New conversation
┌─────────────────────┐ ┌───────────────────────────────────────┐
│ Recent conversations│ │ Current conversation                  │
│ scrollable list     │ │ scrollable message history            │
│ New conversation    │ │                                       │
│                     │ │ Composer and send action               │
└─────────────────────┘ └───────────────────────────────────────┘
```

Align the conversation pane to the center of the remaining workspace. The recent-conversation list is a visible side navigation on desktop; on mobile, move it into a compact, accessible disclosure above the conversation. Keep message scrolling inside the conversation pane and keep the composer visible at its bottom; the page itself should not become an unnecessarily long chat transcript.

## The one memorable thing

Make the conversation list feel like a useful navigator: clear recent titles, a selected state, and an obvious new-chat action beside the focused conversation. Keep the rest of the chat quiet so messages and proposed bookkeeping changes carry the emphasis.

## Assets

No images or generated assets. These are data-heavy workspace screens; typography, spacing, and state labels carry the information.

## Done criteria

- Replace the conversation dropdown with a navigable recent-conversation side list, preserving existing load/new-chat behavior and private workspace scoping.
- Keep the current conversation visually centered, format long histories and proposed changes clearly, and constrain scrolling to the message region while keeping the composer usable.
- Reformat tax readiness gates and workpaper preview into clear evidence/status rows with responsive ordering.
- Verify keyboard access, visible focus, semantic labels, empty/loading/error states, reduced motion, and no horizontal scrolling at 360 px.
- Build and typecheck; capture and inspect screenshots at 360, 768, and 1280 px.

## Anti-generic review

The composition is specific to Raqam’s workflow: tax facts and evidence gates lead into a source-linked draft, while the chat layout emphasizes recent bookkeeping conversations and reviewable changes. It uses the existing neutral ledger palette and established typography rather than introducing a generic gradient, decorative hero image, or a uniform wall of rounded cards.
