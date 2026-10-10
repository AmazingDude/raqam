# Raqam landing page plan

**Status:** in_review; awaiting explicit plan approval before implementation or image generation.
**Date:** 10 October 2026, PKT.
**Branch:** main; all future commits target origin/main.
**Task claim:** LANDING-PLAN owns this document and its short handoff entry.

## 1. Brief and approval boundary

Build a calm, warm, trustworthy landing page for Raqam, an AI bookkeeping assistant for small service-business owners in Pakistan. It turns transaction CSVs and receipt images into a reviewed cashbook, suggests categories, proposes receipt matches and answers questions with record references.

Use English, mobile-first layouts, PKR fictional records and explicit demo labels. Urdu/RTL is a separate future plan.

The memorable interaction is a receipt snapping onto its transaction row, followed by visible user confirmation. Reduced motion receives an immediate state change.

The user's clarified raster budget is **6 candidate images, retaining 2**. This replaces the earlier provisional 12-image draft and original message's assumption that the inventory exceeds eight. Six does not exceed image-studio's eight-image threshold. Plan approval includes this exact budget; expansion requires new approval.

**Pause point:** wait for approval before application edits, generated assets or placeholders. The supplied brief clarifies scope; it is not implementation approval.

## 2. Repository findings and implementation locations

The app already exists: Next.js 16.4.0 App Router, React 19.2.8, TypeScript 5.9.3, npm and CSS Modules. Tailwind is absent. Continue with the existing stack and conventions.

| Area | Existing path / proposed change |
| --- | --- |
| Landing route | src/app/page.tsx: retain / and use the Metadata API |
| Main landing component | src/components/marketing/landing.tsx: section composition and existing Clerk-aware navigation |
| New marketing styles | src/components/marketing/landing.module.css: landing-only layout, responsive behavior and motion |
| Shared design | DESIGN.md and src/components/ui/theme.module.css: reuse tokens/controls; avoid changing workspace selectors for landing effects |
| Product mockups | src/components/marketing/product-mockups.tsx: code-rendered cashbook, receipt and five feature views |
| Interactive leaves | src/components/marketing/receipt-match-demo.tsx, product-walkthrough.tsx, local-csv-demo.tsx |
| Browser CSV preview | src/lib/client/landing-csv.ts: browser-safe parsing with canonical schemas/exact-money helpers |
| Wordmark / icons | src/components/ui/icon.tsx: reuse SVG assets, add missing consistent paths only if needed |
| Raster output | public/generated/: selected images and manifest |
| Sample CSV | public/examples/raqam-service-business.csv: fictional downloadable records |
| Open Graph composition | src/app/opengraph-image.tsx: code-composed 1200 × 630 image |
| CTA destinations | /workspace, /demo, /sign-in, /sign-up and page anchors |

Keep the shell and informational content as Server Components. Only receipt interaction, walkthrough controls and CSV interactions need client code. Preserve signed-out Sign in/Sign up and signed-in workspace entry. Public mockups receive no private workspace records.

No scaffold, Tailwind installation, backend mutation, provider substitution or migration is part of the landing task. New packages are unnecessary unless a measured gap remains after inspecting existing utilities.

## 3. Skills read and applied

The supplied /home/home/.codex/skills paths do not exist on this Windows host. Located and read the preserved repository copies:

| Skill | Actual directory and references |
| --- | --- |
| frontend-craft | docs/references/frontend/bundle/.agents/skills/frontend-craft/: SKILL.md and references/anti-generic.md |
| image-studio | docs/references/frontend/bundle/.agents/skills/image-studio/: SKILL.md, references/presets.json and inspected scripts/generate.py |
| nextjs-developer | docs/references/Jeffallan--claude-skills/skills/nextjs-developer/: SKILL.md, App Router and Server Component references |

Also inspected repository working/team rules, design/routes and installed Next.js 16.4 CSS/image guidance. Verify older skill examples against the installed documentation.

Resolve scripts/references relative to these actual directories. Do not assume a root .agents/skills helper. Preserve the ZIP and extracted reference members.

Apply frontend-craft's approval gate, token/layout plan, anti-generic review, screenshots, accessibility checks and visual cleanup. Apply image-studio's presets, variations, manifest, dry-run and budget. The user's main instruction overrides the skill's feature-branch example.

## 4. Subject, audience and content rules

**Subject:** a reviewed cashbook connecting imported transactions, receipt evidence and owner decisions.

**Audience:** a service-business owner in Pakistan organizing English, PKR records without a dedicated finance team.

Draft headline: **Your records, ready for your review.**

Supporting copy: “Bring transaction CSVs and receipt images together. Review suggested categories and matches, then ask questions with references to your records.”

CTAs: **Open workspace**, **Try the CSV demo**, **Explore the example**.

Keep these distinctions visible:

- CSV records establish cash movement; receipts supply supporting evidence.
- Category and match suggestions remain proposals until the owner confirms.
- Missing fields stay unknown; explicit zero is valid.
- Net cash movement is not profit; a receipt match does not prove settlement.
- Local interactions and sample records are fictional and do not claim live AI, persistence or customer results.

No invented customers, statistics, testimonials, bank integrations, compliance badges or security guarantees. Trust copy explains review and evidence principles factually.

## 5. Visual tokens

Warmth comes from quiet paper materials, original illustration and generous spacing. Retain Raqam's approved neutral design with restrained ledger green for confirmation. Use a light hero with readable product surfaces.

| Token | Hex | Role |
| --- | --- | --- |
| Ink | #18191B | Primary text and controls |
| Paper | #F5F5F3 | Warm-neutral canvas |
| Surface | #FFFFFF | Table, receipt and demo surfaces |
| Graphite | #62656B | Supporting copy |
| Rule | #DFE1E3 | Separators and record grouping |
| Ledger green | #176444 | Confirmed state and restrained accents |

Reuse existing pending/error semantic colors with written labels.

- Typeface: existing Arial/Helvetica/system sans; one family with distinct weights and tabular PKR numerals.
- Type: fluid headings, 16 px body, readable compact mockups; lines below 80 characters.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64 px; section space scales with viewport.
- Radius: existing 10 px controls, 18 px major panels and pill CTAs; vary grouping/elevation by purpose.
- Motion: one receipt-to-row sequence and quiet control feedback; no repeated scroll entrance or card lift.
- Alignment: left-aligned hero/product detail on desktop; stacked mobile order; centered final CTA.

## 6. Section map

| Order | Section | Content and interaction |
| --- | --- | --- |
| 1 | Sticky navigation | Wordmark, workflow/features/demo links, auth-aware CTA, compact mobile navigation and skip link |
| 2 | Hero | Promise, workspace/demo CTAs, assistant illustration beside code cashbook and receipt interaction |
| 3 | Feature navigation | Import, Categories, Receipt matching, Review, Ask Raqam; real anchors with sticky-header offset |
| 4 | Product walkthrough | Manual keyboard-operable slides reusing five mockups, current step, previous/next; no autoplay |
| 5 | Trust principles | Owner confirmation, exact cash arithmetic and source references; no unsupported security claims |
| 6 | Supported inputs | Supported transaction CSV, English JPEG/PNG receipts and PKR scope; unsupported formats identified |
| 7 | Working local CSV demo | Sample/download/file controls, original rows, validation and deterministic browser totals |
| 8 | Import feature | Original rows, issues and explicit confirmation |
| 9 | Categories feature | Proposed category/rationale beside record; labeled sample confirmation/change |
| 10 | Receipt matching feature | Receipt snaps to candidate row; pending until confirmed |
| 11 | Review feature | Original/corrected fields, visible unresolved states |
| 12 | Ask Raqam feature | Illustrative answer with record references; supported sample questions use local deterministic records |
| 13 | Example workflows | Salon, repair shop and agency; fictional scenarios, never testimonials |
| 14 | Illustrative pricing | Clearly marked concept; no subscription offering or purchase flow |
| 15 | FAQ | Native disclosures covering inputs, review, matching, demo scope, PKR and prototype limitations |
| 16 | Final CTA | Workspace/example invitation using the selected background |
| 17 | Footer | Wordmark, relevant route/anchor links, English/PKR scope and team attribution |

The five feature sections form the requested sequence, with varied product-specific compositions.

### Desktop wireframe

    Sticky: Raqam     Workflow / Features / CSV demo     Auth CTA

    Hero copy + CTAs     [cashbook + snapping receipt] [assistant art]
                              Fictional demo label

    Import | Categories | Receipt matching | Review | Ask Raqam

    Walkthrough: large mockup + explanation + manual controls
    Trust principles
    Supported inputs
    Local CSV demo: file/sample controls | preview + errors + totals
    Five varied feature sections
    Fictional workflows: salon | repair shop | agency
    Illustrative pricing
    FAQ disclosures
    Final CTA on quiet selected background
    Footer

### Mobile wireframe

    Sticky wordmark + compact navigation / auth entry
    Hero headline → copy → CTAs
    Code cashbook → receipt proposal → Confirm match
    Assistant art + fictional label
    Wrapped feature links
    Walkthrough mockup → explanation → controls
    Trust principles
    Supported inputs
    CSV controls → issues → preview → totals
    Import → Categories → Matching → Review → Ask Raqam
    Fictional workflows stacked
    Illustrative pricing → FAQ → Final CTA → Footer

## 7. Memorable receipt interaction

Use fictional source/transaction IDs, dates, PKR and exact amounts.

1. Receipt and transaction start separately, labeled **Suggested match**.
2. **Preview match** gently snaps the receipt beside its candidate row. It remains pending.
3. **Confirm match** and **Keep for review** are explicit controls. Confirmation shows **Confirmed in this demo**.
4. A reset control and persistent fictional/local-demo label remain visible.

Build using HTML state, CSS transforms and SVG connectors. Keyboard activation follows the same sequence. Announce meaningful status changes. Reduced motion skips travel and changes state immediately. Confirmation never changes cash totals or writes real records.

## 8. Working local CSV demo

Functional in the browser, independent of login or AI credentials.

- Download/load a fictional PKR CSV using existing supported columns and canonical validation.
- Offer file selection with documented 1 MiB / 50-record prototype caps, strict UTF-8 and quoted-field handling.
- Inspect existing utilities before implementation: the server parser imports Node crypto and cannot simply enter a client bundle. Reuse canonical row schemas and browser-safe pure money helpers. The public preview does not redefine production contracts or import database/authenticated modules.
- Show original fields, interpreted dates/directions/amounts, valid/invalid counts and actionable errors. Unknown amounts remain unresolved.
- Use BigInt/integer-paisa strings for totals across **all valid demo rows**, separately label excluded rows and category review coverage. Never sum just a visible page.
- Allow sample reset and local explicit correction/confirmation within the demo. Distinguish proposals and accepted states.
- Keep chosen-file data in component memory. No upload, live AI, account creation, persistence or localStorage.
- Ask Raqam's sample supports clearly labeled sample questions with code-derived facts/references. Unsupported arbitrary questions receive clarification, not a fabricated model success.
- Public fictional fixtures are separate from reserved evaluation answers.

## 9. Raster assets and exact budget

**Two assets × three candidates = six requested images; select and retain two.**

| Asset | Purpose and subject | Aspect | Preset | Text overlay |
| --- | --- | --- | --- | --- |
| Original assistant illustration | Friendly flat bookkeeping helper with ledger, desk and receipt shapes beside hero mockup; no real person or existing mascot | 1:1 | flat-illustration | None |
| Soft abstract background | Subtle paper/ledger-derived shapes reused for hero and final CTA | 16:9 | abstract-bg | Quiet center for HTML text; test contrast |

Use this **same palette sentence verbatim in both prompts**:

> Use a consistent palette of warm paper white #F5F5F3, clean white #FFFFFF, ink #18191B, muted graphite #62656B, soft gray #DFE1E3 and restrained ledger green #176444.

### Illustration prompt

“Original friendly bookkeeping assistant illustration for a small service-business owner: a simple abstract helper made from ledger and receipt shapes beside a tidy desk, calm welcoming expression, clear flat forms, balanced 1:1 composition and generous negative space. Use a consistent palette of warm paper white #F5F5F3, clean white #FFFFFF, ink #18191B, muted graphite #62656B, soft gray #DFE1E3 and restrained ledger green #176444. No text, numerals, logos, real people, existing mascots or copyrighted characters. The product interface will be built separately in HTML.”

Alt: “Original illustration of a friendly bookkeeping helper beside a ledger, desk and receipts.”

### Background prompt

“Soft restrained abstract background derived from folded paper edges and quiet ledger-like shapes, shallow visual layering, broad calm center reserved for readable HTML headings, landscape 16:9 composition, suitable for a trustworthy bookkeeping page. Use a consistent palette of warm paper white #F5F5F3, clean white #FFFFFF, ink #18191B, muted graphite #62656B, soft gray #DFE1E3 and restrained ledger green #176444. No text, numerals, logos, interface mockups, sharp focal shapes or strong contrast in the center.”

Use empty rendered alt for this purely decorative background; retain a descriptive manifest entry.

### image-studio workflow after approval

1. Resolve scripts/generate.py from the actual image-studio directory above, with its adjacent references. Verify current provider/model compatibility before a real call; do not blindly use an archived model default.
2. Check credential presence without exposing values. Run the skill's dry-run for both approved prompts first.
3. With credentials, generate three illustration candidates at 1:1 and inspect them; then three background candidates at 16:9 and inspect them. Medium quality.
4. Stay inside the six-image cap, including requested replacements. Further batches require expanded approval.
5. Retain one selection per asset in public/generated/. Ensure manifest entries include final filename, exact prompt, descriptive alt, actual dimensions and aspect. Never overwrite existing assets or delete archive members.
6. Check actual format/crop/dimensions; prepare delivery sizes. Use next/image with responsive sizes, explicit dimensions, lazy loading below the fold and the pinned hero-priority API.
7. If credentials are absent, save identified dry-run requests and create exact-aspect CSS/SVG placeholders labeled as artwork placeholders. Continue the approved build, with zero real generation calls and a clear handoff disclosure.

Never print or commit keys. A missing key does not require account provisioning to complete the placeholder page.

## 10. Code-built assets: zero generation calls

- Raqam wordmark and mark in SVG.
- Animated hero cashbook/receipt confirmation in HTML/CSS/SVG.
- Five feature mockups: import, categories, matching, review and chat.
- Walkthrough slides reusing those mockups.
- Six consistent interface icons: import, category, receipt, review, chat, security; reuse existing icons before adding paths.
- Three fictional workflow cards: salon, repair shop, agency.
- **1200 × 630 Open Graph image**, composed in code from wordmark, description and selected illustration. This is not a third generated image.

All text, financial figures, interface states and controls remain code-rendered. Raster art is never presented as a real receipt, customer or private record.

## 11. Illustrative pricing and trust

Use a compact **Illustrative pricing concept** section with the adjacent notice: **“Example only. No subscription is offered here.”**

Proposed display for plan review: one sample concept price, **PKR 1,500 / month**, explicitly **illustrative, unvalidated and unavailable for purchase**. This is not an adopted price, business offer, entitlement or billing integration. Do not invent tiers, limits, discounts or checkout. Its CTA opens the fictional example.

The user may revise/remove the sample number during approval. Keep the qualifier beside the number at every breakpoint and in screen-reader order.

Trust copy explains visible owner review, validated imported cash and source references. Avoid “bank-grade,” guaranteed accuracy, compliance claims, automatic approval or assertions that matching proves payment.

## 12. Anti-generic review

Checked against frontend-craft's anti-generic reference:

- Make receipt-to-record proposal/confirmation the primary visual event.
- Use one sans family and existing neutral/ledger palette, avoiding serif/terracotta or acid-accent defaults.
- Replace repeated rounded feature cards with import table, category comparison, source match, field review and reference-backed answer views.
- The requested abstract background stays subordinate and uses bookkeeping paper motifs.
- Number genuine walkthrough steps only; avoid tracked all-caps patterns and repeated decorative arrows.
- Restrict coordinated motion to receipt matching; walkthrough is manual.
- Remove one nonessential decoration during screenshot review and re-capture. Preserve information-bearing source connections and review labels.

## 13. Implementation sequence after approval

1. Recheck main, concurrent edits and ownership. Diagnose local dependency/typecheck baseline separately if needed.
2. Build semantic shell, approved copy, sticky navigation, anchors, FAQ and footer.
3. Build reusable mockups, fictional PKR records and accessible receipt-confirmation states.
4. Implement browser CSV preview using canonical validation and exact totals.
5. Add walkthrough controls and the five feature sections.
6. Add fictional workflows and visibly illustrative pricing.
7. Run approved image-studio workflow; select two assets or use disclosed placeholders. Add the composed OG image and Metadata API entries.
8. Finish mobile layouts, image loading and reduced-motion behavior.
9. Verify below, refine screenshots, update handoff and push small task-owned commits to main.

After approval, complete this scope autonomously. A larger image budget or material scope change requires a new decision.

## 14. Done criteria and visual verification

- All requested sections appear in the specified order at /.
- Real CTA routes/anchors and existing signed-in/signed-out Clerk navigation work.
- Local sample/file CSV preview works; errors and unknowns stay visible; exact totals cover all valid rows.
- Receipt proposals require confirmation; keyboard/reset/reduced-motion paths work without cash mutation.
- Fictional workflows/sample chat and illustrative pricing have adjacent labels.
- Two selected assets respect the six-candidate cap, or disclosed same-aspect dry-run placeholders are used; manifest data is complete.
- Screenshot and inspect **360, 768 and 1280 px**: sticky nav, anchor offsets, readable tables, image crops, pricing labels, no page horizontal scroll or image layout shift.
- Semantic landmarks, one H1, skip link, accessible carousel/disclosures, visible focus and sensible tab order; touch targets at least 44 px.
- Body/button contrast at least **4.5:1**, appropriate alt text, useful status announcements, browser zoom and reduced motion.
- Remove one unnecessary decoration, re-screenshot and inspect.
- After approval run npm.cmd run typecheck and npm.cmd run build, with focused CSV/interaction verification appropriate to approved behavior. No lint script exists currently; report that rather than claiming a lint pass.
- Verify Metadata API output and **1200 × 630** OG composition.
- Report actual files, selected images/prompts, generated-versus-placeholder status, checks and unverified behavior. Local demos establish no deployment or live AI result.

## 15. Baseline and approval checklist

Repository/design/routes/skills inspection is complete. No landing code, placeholder or image call occurred.

A typecheck already running from main synchronization finished with errors across current app/contracts. Next also reported a native SWC load problem before route generation used a fallback. This is a baseline issue, not evidence against the planned page. Inspect the pinned dependency installation before guessing source repairs; diagnose after approval as a separate slice.

Urdu/RTL, real pricing/billing, additional imagery, live backend/provider feature work and deployment are outside this plan.

Approval requested:

- [ ] Page structure, tokens, copy direction and confirmation interaction.
- [ ] Browser-only CSV demo, code mockups and OG composition.
- [ ] Two original raster assets: **six candidates, retaining two**, with dry-run/placeholders if credentials are absent.
- [ ] Explicitly illustrative PKR 1,500/month concept, or the user's revision.

**Next action:** wait for explicit approval before implementation and image generation.
