import type { DocumentRecord } from '../../lib/contracts/documents.ts';
import { money } from '../../lib/client/presentation.ts';
import s from '../ui/theme.module.css';

const fields = [
  ['merchant', 'Counterparty'], ['documentDate', 'Document date'], ['total', 'Total'],
  ['currency', 'Currency'], ['reference', 'Reference'],
] as const;

export function ReceiptEvidence({ record }: { record: DocumentRecord }) {
  const context = record.extractionContext;
  const evidence = context?.evidence;
  return <section className={s.stack} aria-label="Original extraction evidence">
    <h3>Original extraction evidence</h3>
    <p className={`${s.small} ${s.muted}`}>Observed text and proposed values stay separate from your corrections. Compare them with the original image.</p>
    {evidence ? <>
      <p className={s.small}>Source {evidence.sourceId} · {evidence.status === 'needs_review' ? 'Uncertainty needs review' : 'Fields proposed'}</p>
      {fields.map(([key, label]) => {
        const observation = evidence.fields[key];
        const normalized = typeof observation.normalizedValue === 'string'
          ? key === 'total' ? money(observation.normalizedValue) : observation.normalizedValue
          : 'Unknown';
        return <details key={key}>
          <summary>{label} · {observation.state}</summary>
          <dl className={s.details}>
            <dt>Observed text</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{observation.rawText ?? 'Not observed'}</dd>
            <dt>Proposed value</dt><dd style={{overflowWrap:'anywhere'}}>{normalized}</dd>
            <dt>Source field</dt><dd>{observation.evidenceField.replaceAll('_', ' ')}</dd>
          </dl>
          {observation.observedCandidates.length > 0 && <><p className={s.small}>Observed alternatives</p><ul>{observation.observedCandidates.map((candidate, index) => <li key={index} style={{overflowWrap:'anywhere'}}>{candidate}</li>)}</ul></>}
          {observation.issues.length > 0 && <p className={s.notice}>Review needs: {observation.issues.map(issue => issue.replaceAll('_', ' ')).join(', ')}.</p>}
        </details>;
      })}
      <details><summary>Extraction versions and source identity</summary><dl className={s.details}>
        <dt>Model</dt><dd style={{overflowWrap:'anywhere'}}>{record.document.modelVersion}</dd>
        <dt>Prompt</dt><dd>{record.document.promptVersion}</dd><dt>Schema</dt><dd>{record.schemaVersion}</dd>
        <dt>Source hash</dt><dd style={{overflowWrap:'anywhere'}}>{evidence.sourceVersion}</dd>
      </dl></details>
    </> : <p className={s.notice}>No original field observations are available for this extraction. Review the private source and enter corrections manually.</p>}
    {context?.failure && <p className={s.error} role="status">Extraction stopped: {context.failure.reason.replaceAll('_', ' ')}. {context.failure.retryable ? 'You can retry when ready or review manually.' : 'Review manually or check provider configuration before retrying.'}</p>}
  </section>;
}
