'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCurrentPakistanTaxYear, pakistanTaxPeriod, TAX_INCOME_SOURCES, taxReadinessAnswersSchema,
} from '../../lib/contracts/tax-readiness.ts';
import type { TaxReadinessAnswers, TaxReadinessProfile } from '../../lib/contracts/tax-readiness.ts';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import s from '../ui/theme.module.css';
import styles from './tax-readiness.module.css';

type Draft = {
  taxpayerType: string; residency: string; provinceOrTerritory: string; filingHistory: string;
  incomeSources: string[]; recordsOnHand: string[]; wealthRecords: string[];
};
type Option = { value: string; label: string; hint?: string };
const emptyDraft = (): Draft => ({ taxpayerType: '', residency: '', provinceOrTerritory: '', filingHistory: '', incomeSources: [], recordsOnHand: [], wealthRecords: [] });
const steps = ['Filing profile', 'Income sources', 'Your records', 'Assets and liabilities', 'Review and save'];
const taxpayerOptions: Option[] = [
  { value: 'individual', label: 'Individual', hint: 'A person filing in their own name.' },
  { value: 'association_of_persons', label: 'Association of persons (AOP)', hint: 'For example, a partnership or other AOP.' },
  { value: 'company', label: 'Company' }, { value: 'not_sure', label: 'Not sure yet' },
];
const residencyOptions: Option[] = [
  { value: 'resident', label: 'Resident in Pakistan for tax purposes' },
  { value: 'non_resident', label: 'Non-resident for tax purposes' },
  { value: 'not_sure', label: 'Not sure yet' },
];
const regionOptions: Option[] = [
  { value: 'punjab', label: 'Punjab' }, { value: 'sindh', label: 'Sindh' },
  { value: 'khyber_pakhtunkhwa', label: 'Khyber Pakhtunkhwa' }, { value: 'balochistan', label: 'Balochistan' },
  { value: 'islamabad_capital_territory', label: 'Islamabad Capital Territory' },
  { value: 'gilgit_baltistan', label: 'Gilgit-Baltistan' }, { value: 'azad_jammu_kashmir', label: 'Azad Jammu and Kashmir' },
  { value: 'outside_pakistan', label: 'Outside Pakistan' }, { value: 'not_sure', label: 'Not sure yet' },
];
const filingOptions: Option[] = [
  { value: 'filed_before', label: 'I have filed before' }, { value: 'first_time', label: 'This will be my first return' },
  { value: 'not_sure', label: 'Not sure yet' },
];
const incomeOptions: Option[] = [
  { value: 'salary', label: 'Salary or employment income' }, { value: 'business_or_freelance', label: 'Business or freelance income' },
  { value: 'rent', label: 'Rent from property' }, { value: 'bank_profit', label: 'Bank profit or profit on debt' },
  { value: 'dividends_or_investments', label: 'Dividends or investment income' }, { value: 'capital_gains', label: 'Gains from selling assets or investments' },
  { value: 'foreign_income', label: 'Income from outside Pakistan' }, { value: 'other', label: 'Other income' },
  { value: 'none', label: 'None of these' }, { value: 'not_sure', label: 'Not sure yet' },
];
const recordOptions: Option[] = [
  { value: 'salary_certificate', label: 'Annual salary certificate' },
  { value: 'business_income_expense_records', label: 'Business income and expense records' },
  { value: 'rental_records', label: 'Rental agreements or rent records' },
  { value: 'bank_profit_certificate', label: 'Bank profit and tax deduction certificates' },
  { value: 'investment_statements', label: 'Investment or brokerage statements' },
  { value: 'foreign_income_tax_records', label: 'Foreign income and foreign tax records' },
  { value: 'prior_year_return', label: 'A copy of a previous return' },
  { value: 'withholding_certificates', label: 'Other withholding or advance tax certificates' },
  { value: 'other', label: 'Other supporting records' },
  { value: 'not_collected_yet', label: 'I have not collected records yet' }, { value: 'not_sure', label: 'Not sure yet' },
];
const wealthOptions: Option[] = [
  { value: 'bank_cash_balances', label: 'Bank and cash balances' }, { value: 'property_vehicle_records', label: 'Property or vehicle records' },
  { value: 'investment_balances', label: 'Investment balances' }, { value: 'loans_liabilities', label: 'Loan or liability records' },
  { value: 'major_personal_expenses', label: 'Major personal expense records' }, { value: 'asset_transfers_gifts', label: 'Asset transfers or gift records' },
  { value: 'not_applicable', label: 'Not applicable to my situation' },
  { value: 'not_collected_yet', label: 'I have not collected records yet' }, { value: 'not_sure', label: 'Not sure yet' },
];
const labelMaps: Record<string, Record<string, string>> = {
  taxpayerType: Object.fromEntries(taxpayerOptions.map(option => [option.value, option.label])),
  residency: Object.fromEntries(residencyOptions.map(option => [option.value, option.label])),
  provinceOrTerritory: Object.fromEntries(regionOptions.map(option => [option.value, option.label])),
  filingHistory: Object.fromEntries(filingOptions.map(option => [option.value, option.label])),
  incomeSources: Object.fromEntries(incomeOptions.map(option => [option.value, option.label])),
  recordsOnHand: Object.fromEntries(recordOptions.map(option => [option.value, option.label])),
  wealthRecords: Object.fromEntries(wealthOptions.map(option => [option.value, option.label])),
};
function displayChoice(key: string, value: string): string { return labelMaps[key]?.[value] ?? value.replaceAll('_', ' '); }

function RadioGroup({ name, legend, value, options, onChange }: { name: string; legend: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <fieldset className={styles.fieldset}><legend>{legend}</legend><div className={styles.radioGrid}>{options.map(option => {
    const id = `${name}-${option.value}`;
    return <label key={option.value} className={`${styles.choice} ${value === option.value ? styles.selected : ''}`} htmlFor={id}>
      <input id={id} type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>
    </label>;
  })}</div></fieldset>;
}
function CheckGroup({ name, legend, value, options, onChange }: { name: string; legend: string; value: string[]; options: Option[]; onChange: (value: string[]) => void }) {
  return <fieldset className={styles.fieldset}><legend>{legend}</legend><div className={styles.checkGrid}>{options.map(option => {
    const id = `${name}-${option.value}`;
    const checked = value.includes(option.value);
    return <label key={option.value} className={`${styles.choice} ${checked ? styles.selected : ''}`} htmlFor={id}>
      <input id={id} type="checkbox" name={name} value={option.value} checked={checked} onChange={event => {
        if (event.target.checked) onChange(['none', 'not_applicable', 'not_collected_yet', 'not_sure'].includes(option.value) ? [option.value] : [...value.filter(item => !['none', 'not_applicable', 'not_collected_yet', 'not_sure'].includes(item)), option.value]);
        else onChange(value.filter(item => item !== option.value));
      }} />
      <span><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>
    </label>;
  })}</div></fieldset>;
}

function recordsChecklist(answers: TaxReadinessAnswers): string[] {
  const tasks = new Set<string>();
  const selected = new Set<string>(answers.recordsOnHand);
  const incomeRecords: Partial<Record<(typeof TAX_INCOME_SOURCES)[number], string>> = {
    salary: 'salary_certificate', business_or_freelance: 'business_income_expense_records', rent: 'rental_records',
    bank_profit: 'bank_profit_certificate', dividends_or_investments: 'investment_statements', capital_gains: 'investment_statements',
    foreign_income: 'foreign_income_tax_records', other: 'other',
  };
  const gatherText: Record<string, string> = {
    salary_certificate: 'Request annual salary and deduction certificates, if applicable.',
    business_income_expense_records: 'Organize business income, expense records and supporting statements.',
    rental_records: 'Gather rent agreements, receipts and related property records.',
    bank_profit_certificate: 'Gather bank profit and tax deduction certificates.',
    investment_statements: 'Gather investment statements and records for asset sales.',
    foreign_income_tax_records: 'Gather foreign income statements and any foreign tax evidence.',
    other: 'List other income and the records that support it.',
  };
  for (const source of answers.incomeSources) {
    const record = incomeRecords[source];
    if (record && !selected.has(record)) tasks.add(gatherText[record]!);
  }
  if (answers.incomeSources.includes('not_sure')) tasks.add('Review all possible income sources with a qualified Pakistan tax practitioner.');
  if (answers.filingHistory === 'filed_before' && !selected.has('prior_year_return')) tasks.add('Find a previous return and any related wealth statement, if available.');
  if (!selected.has('withholding_certificates') && answers.incomeSources.some(source => source !== 'none' && source !== 'not_sure')) {
    tasks.add('Check whether tax was withheld or paid and collect certificates if available; do not estimate missing amounts.');
  }
  if (answers.wealthRecords[0] !== 'not_applicable' && answers.wealthRecords.some(item => item === 'not_collected_yet' || item === 'not_sure')) {
    tasks.add('Ask a qualified practitioner which asset, liability and personal-spending records apply to your situation.');
  }
  if (answers.residency === 'not_sure' || answers.taxpayerType === 'not_sure' || answers.provinceOrTerritory === 'not_sure') {
    tasks.add('Confirm taxpayer type, residency and relevant jurisdiction with a qualified Pakistan tax practitioner.');
  }
  if (!tasks.size) tasks.add('Review these records with a qualified tax practitioner before preparing a return.');
  return [...tasks];
}

export function TaxReadinessScreen({ active, demo, workspaceId }: { active: boolean; demo: boolean; workspaceId: string }) {
  const request = usePrivateRequests();
  const heading = useRef<HTMLHeadingElement>(null);
  const taxYear = getCurrentPakistanTaxYear();
  const period = useMemo(() => pakistanTaxPeriod(taxYear), [taxYear]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [profile, setProfile] = useState<TaxReadinessProfile | null>(null);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => { if (active && loaded) heading.current?.focus(); }, [step]);

  useEffect(() => {
    if (!active || demo || loaded) return;
    let live = true;
    setLoading(true); setLoadError('');
    void request(signal => api.taxReadiness(workspaceId, signal)).then(state => {
      if (!live) return;
      if (state.taxYear !== taxYear) throw new Error('The current Pakistan tax year changed. Reload the workspace.');
      setProfile(state.profile);
      if (state.profile) setDraft(state.profile.answers);
      setLoaded(true);
    }).catch(reason => {
      if (live) setLoadError(reason instanceof Error ? reason.message : 'The saved profile could not load. Retry.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active, demo, loaded, request, retryCount, taxYear, workspaceId]);

  const parsed = useMemo(() => taxReadinessAnswersSchema.safeParse(draft), [draft]);
  const savedUnchanged = profile !== null && JSON.stringify(profile.answers) === JSON.stringify(draft);
  const canContinue = step === 0
    ? Boolean(draft.taxpayerType && draft.residency && draft.provinceOrTerritory && draft.filingHistory)
    : step === 1 ? draft.incomeSources.length > 0 && (!draft.incomeSources.includes('none') || draft.incomeSources.length === 1)
    : step === 2 ? draft.recordsOnHand.length > 0
    : step === 3 ? draft.wealthRecords.length > 0
    : parsed.success;
  const checklist = parsed.success ? recordsChecklist(parsed.data) : [];
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value })); setConfirmed(false); setSuccess(''); setError('');
  }
  function moveTo(next: number) { setStep(Math.max(0, Math.min(steps.length - 1, next))); setConfirmed(false); setError(''); }
  async function save() {
    if (saving || !confirmed) return;
    const answers = taxReadinessAnswersSchema.safeParse(draft);
    if (!answers.success) { setError('Complete each question before saving.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const state = await request(signal => api.saveTaxReadiness(workspaceId, { taxYear, answers: answers.data, confirmed: true, expectedVersion: profile?.version ?? 0 }, signal));
      if (!state.profile || state.taxYear !== taxYear) throw new Error('The saved profile could not be verified. Reload and review it.');
      setProfile(state.profile); setDraft(state.profile.answers); setConfirmed(false);
      setSuccess(`Saved for tax year ${state.taxYear}. Your answers were not sent to Ask Raqam or an AI provider.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The profile could not be saved. Your earlier saved profile is unchanged.'); }
    finally { setSaving(false); }
  }

  return <section className={styles.screen} aria-labelledby="tax-readiness-title">
    <div className={s.pageHeading}><div><h1 id="tax-readiness-title">Tax readiness</h1><p>A guided profile and records checklist for a Pakistan tax return.</p></div>{profile && <span className={`${s.badge} ${s.good}`}>Saved · version {profile.version}</span>}</div>
    <div className={styles.yearRibbon} aria-label={`Pakistan tax year ${taxYear}, ${period.startDate} to ${period.endDate}`}>
      <div><span>Current normal tax year</span><strong>TY{taxYear}</strong></div>
      <div className={styles.periodTrack} aria-hidden="true"><i/><b/><i/></div>
      <div className={styles.periodDates}><span>{period.startDate}</span><span>{period.endDate}</span></div>
    </div>
    <div className={`${s.notice} ${styles.privacyNotice}`}><p><strong>Private readiness checklist.</strong> Draft answers stay in this tab until you confirm a save. Saved profiles are private to your workspace; no answers are sent to an AI provider. Raqam does not calculate tax, decide eligibility, or file or pay a return.</p><p className={s.small}>Standard July–June year shown; an approved special tax year may differ.</p></div>
    <p className={`${s.small} ${styles.sourceLink}`}><a href="https://www.fbr.gov.pk/income-tax/81145/81149" target="_blank" rel="noreferrer">FBR: how Pakistan tax years are named</a><span> · </span><a href="https://fbr.gov.pk/categ/file-income-tax-return/51147/80860/71158" target="_blank" rel="noreferrer">FBR return-filing guidance</a></p>

    {demo ? <div className={s.panel}><div className={s.panelHeading}><h2>Use a signed-in workspace</h2></div><div className={styles.panelBody}><p>This example workspace is synthetic. Tax answers are private and cannot be entered or saved in a demo.</p></div></div>
    : loading ? <div role="status" className={s.notice}>Loading your saved tax profile…</div>
    : loadError ? <div className={s.stack}><p className={s.error} role="alert">{loadError}</p><button type="button" className={s.secondary} onClick={() => { setLoaded(false); setRetryCount(value => value + 1); }}>Retry loading profile</button></div>
    : loaded && <>
      <ol className={styles.progress} aria-label="Tax profile steps">{steps.map((label, index) => <li key={label} className={index === step ? styles.currentStep : index < step ? styles.completeStep : ''} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span><small>{label}</small></li>)}</ol>
      <div className={`${s.panel} ${styles.questionPanel}`}>
        <div className={s.panelHeading}><div><h2 ref={heading} tabIndex={-1}>{steps[step]}</h2><p className={`${s.small} ${s.muted}`}>Step {step + 1} of {steps.length}</p></div>{profile && <span className={`${s.small} ${s.muted}`}>Editing saved version {profile.version}</span>}</div>
        <div className={styles.panelBody}>
          {step === 0 && <div className={styles.fieldGrid}>
            <RadioGroup name="taxpayerType" legend="What type of taxpayer will file?" value={draft.taxpayerType} options={taxpayerOptions} onChange={value => update('taxpayerType', value)}/>
            <RadioGroup name="residency" legend="Which residency description fits your understanding?" value={draft.residency} options={residencyOptions} onChange={value => update('residency', value)}/>
            <RadioGroup name="provinceOrTerritory" legend="Which region is relevant to your tax affairs?" value={draft.provinceOrTerritory} options={regionOptions} onChange={value => update('provinceOrTerritory', value)}/>
            <RadioGroup name="filingHistory" legend="What is your filing history?" value={draft.filingHistory} options={filingOptions} onChange={value => update('filingHistory', value)}/>
          </div>}
          {step === 1 && <CheckGroup name="incomeSources" legend="Which income sources should a practitioner review for this tax year? Choose all that apply, or choose “None of these” or “Not sure yet”." value={draft.incomeSources} options={incomeOptions} onChange={value => update('incomeSources', value)}/>}
          {step === 2 && <CheckGroup name="recordsOnHand" legend="Which supporting records do you already have? This is only a checklist, not a requirement decision." value={draft.recordsOnHand} options={recordOptions} onChange={value => update('recordsOnHand', value)}/>}
          {step === 3 && <CheckGroup name="wealthRecords" legend="Which records could help discuss assets, liabilities and spending, if applicable?" value={draft.wealthRecords} options={wealthOptions} onChange={value => update('wealthRecords', value)}/>}
          {step === 4 && parsed.success && <div className={styles.reviewLayout}>
            <section className={styles.reviewCard} aria-labelledby="profile-summary-title"><h3 id="profile-summary-title">Your answers</h3><dl>
              <dt>Taxpayer type</dt><dd>{displayChoice('taxpayerType', parsed.data.taxpayerType)}</dd>
              <dt>Residency</dt><dd>{displayChoice('residency', parsed.data.residency)}</dd>
              <dt>Region</dt><dd>{displayChoice('provinceOrTerritory', parsed.data.provinceOrTerritory)}</dd>
              <dt>Filing history</dt><dd>{displayChoice('filingHistory', parsed.data.filingHistory)}</dd>
              <dt>Income sources</dt><dd>{parsed.data.incomeSources.map(value => displayChoice('incomeSources', value)).join(', ')}</dd>
              <dt>Records on hand</dt><dd>{parsed.data.recordsOnHand.map(value => displayChoice('recordsOnHand', value)).join(', ')}</dd>
              <dt>Wealth records</dt><dd>{parsed.data.wealthRecords.map(value => displayChoice('wealthRecords', value)).join(', ')}</dd>
              <dt>Tax period</dt><dd>TY{taxYear}: {period.startDate} to {period.endDate}</dd>
            </dl></section>
            <section className={styles.checklistCard} aria-labelledby="records-checklist-title"><h3 id="records-checklist-title">Records to bring together</h3><p>Based on your selections; confirm what applies with a qualified Pakistan tax practitioner.</p><ul>{checklist.map(item => <li key={item}>{item}</li>)}</ul></section>
            <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setError(''); }}/> <span><strong>I reviewed these answers and want to save this profile to my workspace.</strong><small>This explicit confirmation is required each time you save.</small></span></label>
            {profile && savedUnchanged && <p className={`${s.small} ${s.muted}`}>No answers changed since the saved profile. Edit an answer before saving an update.</p>}
            {success && <p role="status" className={s.success}>{success}{profile && <span> Saved {new Date(profile.updatedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}.</span>}</p>}
            {error && <p role="alert" className={s.error}>{error}</p>}
            <button type="button" className={s.button} disabled={!confirmed || saving || !parsed.success || savedUnchanged} onClick={save}>{saving ? 'Saving profile…' : profile ? 'Save profile update' : 'Save profile'}</button>
            <p className={`${s.small} ${s.muted}`}>This creates a versioned workspace profile. Your answers are not used to change the bookkeeping records.</p>
          </div>}
        </div>
        <div className={styles.navigation}>
          <button type="button" className={s.secondary} onClick={() => moveTo(step - 1)} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? <button type="button" className={s.button} disabled={!canContinue} onClick={() => moveTo(step + 1)}>Continue</button>
            : <button type="button" className={s.secondary} onClick={() => moveTo(0)}>Edit answers</button>}
        </div>
      </div>
      {profile && <p className={`${s.small} ${styles.savedNote}`}>Last saved {new Date(profile.updatedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}. Draft changes remain in this tab until saved; leaving the workspace clears them.</p>}
    </>}
  </section>;
}