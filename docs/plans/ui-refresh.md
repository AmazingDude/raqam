# UI refresh — 10 October 2026

Status: in_review pending integration with the latest `origin/main`. User requested landing and website UI improvement with Jinna.ai inspiration. This continues the already approved monochrome direction in `DESIGN.md`; no product scope changes.

Claim: `src/components/marketing/{landing.tsx,landing-preview.tsx,landing.module.css,landing-nav.tsx}`, `src/components/ui/theme.module.css`, presentation-only workspace shell/cashbook changes, auth-page styling, frontend checks, the frontend review disposition, and append-only BUILD_PLAN/handoff entries. Unrelated staged/untracked AI work is preserved.

Audience: small service-business owners reviewing PKR cash activity.
Subject: a clear cashbook with visible source evidence and explicit human review.

Tokens: ink #18191B, canvas #F5F5F3, white #FFFFFF, muted #62656B, border #DFE1E3, dark muted #C5C7CB. Existing green/amber/red are reserved for labeled financial states. System sans typography, tabular amounts. Spacing 4/8/12/16/24/32/48/64. Controls 10px, panels 18–24px, pill CTAs. Feedback 150ms, reduced-motion respected, no ambient animations.

Landing (centered): navigation → generous dark hero + two CTAs → light interactive product preview → import/review/export sequence → source comparison + assistant examples → FAQs → final CTA/footer.
Workspace (left aligned): restrained sidebar → breadcrumb/account → screen heading/actions → totals → review coverage → filters/table; consistent document/review/assistant surfaces.
Mobile: working nav disclosure; stacked source comparisons; readable, labeled financial rows; 44px controls.

Memorable element: an inspectable transaction-to-receipt relationship, rendered in code with explicit synthetic labels. No decorative photography or generated assets are needed; product data is the visual subject. No new packages, copied Jinna assets, social proof or blanket provider claims.

Implemented: landing + workspace shared UI polished; preview totals use exact integer-paisa arithmetic for filtered rows; original/reviewed evidence content differs; accessible tabs, nav, FAQ, focus and reduced motion. No live provider or signed-in financial mutation was used for UI verification.

Validation on the task branch: `npm test` (154/154), `npm run typecheck`, `npm run build`, client API tests (6/6), frontend HTTP smoke (3 public/UI routes and 9 signed-out private GET denials), and configured platform smoke (27 private requests denied) passed. The production landing and synthetic `/demo` preview were inspected at desktop; the tab interaction was exercised. Responsive screenshots at 360/768/1280 were reviewed with no horizontal overflow. Next: integrate with current `origin/main`, rerun applicable checks, then publish the task-owned commit.
