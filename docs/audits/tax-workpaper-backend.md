# Tax workpaper backend audit — 21 October 2026

## Conclusion

The product currently produces a printable bookkeeping/readiness draft. It does not implement a completed Pakistan income-tax workpaper or calculate taxable income or liability. The screen explicitly discloses these limits. Completing the self-reported profile does not complete the workpaper.

## Implemented and tested

- Owner-scoped profile GET/save API, strict answer validation, explicit confirmation and optimistic version checks: `src/app/api/tax-readiness/route.ts`, `src/lib/server/tax-readiness.ts`.
- Persisted profile storage, owner isolation, restricted writes and versioned save RPC: migration `202610100015_tax_readiness_profiles.sql`.
- Server-side income statement from ledger journals, inclusive date filtering and exact integer arithmetic: `src/app/api/ledger/reports/route.ts`, `src/lib/server/ledger/calculations.ts`.
- UI combines those real data sources into a browser-printable summary: `src/components/workspace/profile-tax-screen.tsx:64`.

## Gaps

1. **No tax computation backend.** No approved, versioned rule pack, taxable-income adjustments, applicable rate computation, credits, withholding amount reconciliation or final liability calculation. Accounting net income is not a tax calculation.
2. **Review gates are informational.** The generation condition (line 76) requires a completed self-reported profile and an income statement, but does not require full-period ledger coverage. Official-rule and practitioner statuses are fixed strings (lines 84 and 87). This is disclosed as draft-only; it must not become a completed-workpaper status without backend enforcement.
3. **No verified supporting schedules.** Profile completion checks closed answer choices and declared record categories, not verified documents, monetary schedules or evidence. The income/withholding gate counts declared income sources (line 86). Applicable wealth values and reconciliation are absent.
4. **No durable generated artifact.** Generate sets local React state and calls `window.print()` (line 90). There is no workpaper creation endpoint, immutable input/rule snapshot, persisted workpaper ID/version, export artifact or workpaper audit history. Profile persistence is separate and real.
5. **Limited traceability.** The preview prints profile version and workspace/aggregate ledger totals, but no journal-by-journal source references or supporting document links despite the “Source-linked summary” description.
6. **Current-year-only scope.** The year is selected automatically by `getCurrentPakistanTaxYear()` and saves are restricted to that year. On this audit date it is TY2027 (1 July 2026–30 June 2027); users cannot select the preceding completed TY2026 through this flow.
7. **No practitioner approval workflow.** No stored reviewer identity, review decision, timestamp, signed version or reapproval after inputs change.

## Completion criteria for a real workpaper

Define taxpayer/year scope; add verified monetary schedules and applicable evidence; implement deterministic calculations against reviewed enacted rule versions; store reproducible workpaper snapshots with source references; enforce readiness and approval on the server; provide durable export and tests with independently checked examples. Profile completion alone must not imply completion of those steps.

## Verification

CLI command:

```sh
node --conditions=react-server --test --test-isolation=none tests/backend/tax-readiness.test.ts tests/backend/tax-readiness-service.test.ts tests/security/tax-readiness-database.test.ts tests/e2e/tax-readiness-client.test.ts tests/backend/ledger-calculations.test.ts
```

Result: **18 passed, 0 failed**. Includes embedded-database persistence/authorization tests and mocked client/service checks. These tests validate the existing profile and accounting foundations; they do not validate tax liability or a completed workpaper. No GUI was opened, hosted database inspected, live account accessed or deployed generation tested in this audit.

## Official reference

[FBR — File income tax return](https://www.fbr.gov.pk/categ/file-income-tax-return/51147/80860/71160) describes return and wealth-statement completion and wealth reconciliation in Iris. The present aggregate bookkeeping summary does not implement those filing schedules. No numerical tax rates or enacted rule contents were verified or added by this audit.
