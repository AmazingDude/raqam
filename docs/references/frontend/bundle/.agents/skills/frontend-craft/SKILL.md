---
name: frontend-craft
description: Plan, build, and verify distinctive, accessible, responsive frontends (landing pages, dashboards, app screens, React/Next.js/Vite/plain HTML) with a design-token plan, real imagery from the image-studio skill, and screenshot-based self-review. Use this skill whenever the user asks to build, design, restyle, or polish any UI, page, component, or website, even for small tasks like "make this look better", and whenever a UI needs hero images, illustrations, or placeholder art.
---

# Frontend Craft

Plan first, then build autonomously, then verify. Stop for approval only at the plan step.

## 1. Plan (write `docs/plans/<task>.md`, then wait for approval)

Include:
- **Subject and audience**: one concrete sentence each. A fintech dashboard and a kids' toy shop must not look alike.
- **Tokens**: 4-6 named hex colors, 1-2 typefaces with roles, a spacing scale, one radius rule, one motion rule.
- **Layout**: a short ASCII wireframe per screen plus alignment (left, centered).
- **The one memorable thing**: pick one element to spend boldness on; keep the rest quiet.
- **Assets needed**: list every image with purpose, aspect ratio, and where text will overlay it.
- **Done criteria**: pages/components, breakpoints, accessibility checks.

Before approval, check the plan against the generic defaults in `references/anti-generic.md`. If a part would fit any similar product, revise it and say what changed.

## 2. Generate assets (image-studio)

For each listed asset, use the `image-studio` skill:
`python .agents/skills/image-studio/scripts/generate.py "<prompt>" --preset <preset> --aspect <ratio> --n 3 --out public/generated --name <slug>`
Pick the best result, delete the rest, and read `public/generated/manifest.json` for dimensions and alt text. If no image API key is set, run with `--dry-run`, use a CSS/SVG placeholder of the exact aspect ratio, and tell the user how to enable generation.

## 3. Build

- Detect the stack from `package.json`; follow existing conventions, component library, and lint rules. Do not add frameworks.
- Define tokens once (CSS variables or the Tailwind theme) and use only tokens afterward.
- Semantic HTML first (`header`, `nav`, `main`, `button`, real `label`s).
- Images: use the manifest's `width`/`height`, `alt`, `loading="lazy"` below the fold, and `fetchpriority="high"` for the hero.
- Layout: mobile-first, fluid type with `clamp()`, line length under 80 characters, no horizontal scroll at 360px.
- Motion: one orchestrated moment at most; motion that responds to user action is fine; honor `prefers-reduced-motion`.
- Copy: active voice, sentence case, buttons name the action ("Save changes"), errors say what happened and how to fix it. See `references/anti-generic.md`.
- Keep selectors low-specificity so section padding and CTA rules do not cancel each other.

## 4. Verify (do not skip)

1. Run the project's build, typecheck, and lint. Fix failures.
2. Screenshot at 360, 768, and 1280 px (Playwright if installed: `npx playwright screenshot --viewport-size=360,800 <url> shot-360.png`). Look at each one.
3. Check: visible keyboard focus, contrast of body text and buttons at least 4.5:1, every image has alt, tab order matches visual order, reduced motion respected.
4. Remove one decorative element (the "mirror test"), then re-screenshot.
5. Report: what was built, files changed, assets generated (with prompts), checks run, anything not verified.

## Autonomy rules

- After plan approval, do not ask about choices the plan already covers.
- Ask only when scope grows, an API key or paid action is needed, or an existing design system conflicts with the plan.
- Never overwrite user content or assets without saying so; commit in small steps on a feature branch.
