# Ask Raqam chat redesign

User revision: keep the borderless composer at the top, with the submitted question and reply beneath it. Apply this to both the live `ChatScreen` and example `AssistantScreen`; use Raqam's existing mark, grey right-aligned user bubbles and white left-aligned replies. This supersedes the original bottom-composer placement below.

## Subject and audience

- **Subject:** A focused bookkeeping assistant workspace for writing history, correcting cashbook records, and asking about existing records.
- **Audience:** Small service-business owners reviewing their books in a private Raqam workspace.

## Tokens

Use the shared workspace theme tokens, with chat-specific semantic aliases only where needed:

- **Colors:** ink `#18191b`, warm canvas `#f5f5f3`, surface `#ffffff`, secondary `#62656b`, hairline `#dfe1e3`, verified green `#176444`; provide dark variants and preserve readable contrast.
- **Type:** system stack `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif; compact title 20px/600, message body 15px with 1.65 line-height, metadata 12px.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48px.
- **Radius:** 10px small controls, 16px proposal surfaces, 20px panels, 24px composer, 999px icon/primary actions.
- **Motion:** 180ms ease-out hover and message-state transitions; disable animation and smooth scrolling under `prefers-reduced-motion`.

## Layout

```text
┌ workspace nav ┬ recent conversation rail ┬──────── top bar ────────┐
│ 44px targets  │ New conversation          │ Ask Raqam   Export  ◉  │
│ quiet active  │ Today / Yesterday / 7d    ├────────────────────────┤
│               │ private to workspace      │ centered 720px thread  │
│               │ draft note pinned below   │ messages / proposals   │
│               │                           │ floating composer      │
└───────────────┴───────────────────────────┴────────────────────────┘
```

On compact screens the workspace and conversation navigation become accessible disclosures/drawers; the thread remains a single column with its composer pinned inside the chat region.

## The one memorable thing

The selected conversation rail quietly frames a narrow reading column; user bubbles and reviewable proposal cards distinguish who spoke and what would change without boxing every assistant response.

## Assets

No generated assets. Existing line icons, message content, and bookkeeping proposal data carry the interface.

## Done criteria

- Keep existing routes, API calls, history loading, save/discard behavior, notices, and all current copy.
- Put recent conversations in the secondary rail, grouped by date, with a new-chat action, skeleton rows, and a useful empty state.
- Render a centered scrollable conversation and pinned growing composer with Enter/Shift+Enter behavior, response status, and conditional auto-scroll.
- Support dark mode, 44px navigation targets, keyboard focus, accessible status labels, reduced motion, and narrow layouts without horizontal overflow.
- Run typecheck, tests, and production build. Do not launch the app GUI; screenshot inspection is deferred to the user.

## Anti-generic review

The rail grouping follows actual conversation dates and the proposal treatment encodes draft review state. The existing warm ledger palette and system typography remain the design vocabulary; no generic gradients, decorative illustrations, or repeated card grid are introduced.
