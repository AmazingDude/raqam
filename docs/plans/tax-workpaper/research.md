# Pakistan income-tax workpaper: source register

Researched 21 October 2026. This is planning research, not an approved executable rule pack. FBR web pages can lag legislation; the statute, effective amendments and prescribed form applicable to the selected year must be reconciled before calculation release.

## Official sources

| ID | Official source | Observed evidence and intended use |
| --- | --- | --- |
| FBR-01 | [Income Tax Ordinance index](https://www.fbr.gov.pk/Categ/Income-Tax-Ordinance/326) and [30 June 2026 consolidated PDF](https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf) | Index and PDF retrieved. Text checked for sections 4, 9–11, 20–23, 74, 116, 168 and 174; section headings also identify additional regimes requiring screening. This consolidation is a starting point, not automatically the correct effective law for every past year. |
| FBR-02 | [Finance Acts index](https://www.fbr.gov.pk/Categ/Finance-Acts/620) | Lists Finance Acts 2025 and 2026. PDF links located; browser extraction rejected their large size. Their detailed commencement/application provisions remain to be reviewed for executable year packs. Do not substitute a Finance Bill. |
| FBR-03 | [Income Tax Rules, 2002](https://www.fbr.gov.pk/categ/income-tax-rules-2002/335) | Index lists consolidation through 15 September 2026. PDF extraction timed out. Review actual rules and later applicable notifications before form mapping. |
| FBR-04 | [Income Tax Basics](https://www.fbr.gov.pk/income-tax/51147/61148) | Describes normal tax-year naming and broad income heads. Useful for user explanations; do not copy potentially stale residency tests into code. |
| FBR-05 | [Completing the return](https://www.fbr.gov.pk/categ/file-income-tax-return/51147/80860/71160) | Explains Iris return/wealth workflow and wealth reconciliation. This does not establish that every entity has an identical wealth obligation. Apply taxpayer-specific statutory tests. |
| FBR-06 | [Withholding rate cards](https://ipv6.fbr.gov.pk/withholding-taxes-rate-card/174298/174301) | Official indexed text distinguishes TY2026/Finance Act 2025 from TY2027/Finance Act 2026. Full page retrieval timed out. Cards are cross-checks; section-specific statutory treatment controls. |
| FBR-07 | [SRO register](https://www.fbr.gov.pk/ShowSROs) | Indexed text identifies 1495(I)/2026 as final electronic returns for TY2026. Direct page returned search shell only. Download, verify final notification and subsequent amendments before approving a TY2026 field map; index text alone is insufficient. |
| FBR-08 | [Record keeping guidance](https://www.fbr.gov.pk/categ/file-income-tax-return/51147/80860/%2071163) | States six-year record keeping. Read together with section 174 exceptions and pending proceedings; do not implement automatic deletion based only on six years. |

Downloaded FBR-01 PDF SHA-256: `1b611d31c667107a65d3d47a97e163df2ee8ba403952930f527db11d40b32c8b`. Research copy held in `/tmp`, not bundled as an application dependency. Reacquire and verify during rule-pack creation; retain a controlled source copy with the reviewed pack.

## Statutory topics mapped to workpaper features

These are implementation research targets, not a determination of a user's liability:

| Provision | Product requirement |
| --- | --- |
| Section 4; relevant First Schedule | Taxpayer/year-specific calculation and credit ordering; screen separately taxed income. |
| Sections 9–11 | Distinguish accounting profit, income heads and taxable-income computation. |
| Sections 18, 20–25 and applicable loss provisions | Business income, supported deductions, disallowances, asset allowances and carry-forward controls. |
| Section 74 | Explicit normal-year period; special years need separate support. |
| Sections 114, 116 and 116A | Applicable return particulars, wealth reconciliation and foreign-information screening. |
| Sections 147, 168 and 169 | Advance tax and withholding treatment, including exceptions to ordinary credits. |
| Sections 4AB, 4C, 113 and applicable special regimes | Applicability checks before treating ordinary slabs as sufficient. |
| Section 174 | Evidence, reproducibility, retention and exceptions. |

The profile categories currently stored by Raqam do not supply these monetary schedules. Net ledger profit cannot be presented as taxable income by changing its label.

## Legal verification still required before enabling calculations

- Resolve enacted effective law per supported tax year, including retrospective provisions, applicable SROs and subsequent amendments. “Latest PDF” is not a year-selection strategy.
- Verify all exact rates, thresholds, definitions, reliefs, ordering, rounding, attribution and eligibility conditions against the source paragraphs. No numeric rates are approved by this planning task.
- Verify the actual prescribed final form and field semantics for each year. An older paper return is not a verified current electronic-return mapping.
- Obtain qualified Pakistan tax review of the supported-case matrix, fixtures and pack. Practitioner approval is a Raqam product gate retained from PRD D18, not a claim that FBR legally requires every taxpayer to use a practitioner.
- Decide reviewer identity/qualification verification and access before any “reviewed” status can be released. Owner confirmation proves ownership of an assertion, not independent practitioner review.
