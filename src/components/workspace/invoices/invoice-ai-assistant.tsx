'use client';

import { useRef, useState } from 'react';
import { api } from '../../../lib/client/api.ts';
import { invoiceAIChangesSchema } from '../../../lib/contracts/invoices.ts';
import { usePrivateRequests } from '../../../lib/client/use-private-requests.ts';
import type { Invoice } from '../../../lib/contracts/invoices.ts';
import s from './invoices.module.css';

interface InvoiceAIAssistantProps {
  currentInvoice: Partial<Invoice>;
  onApplyDraft: (draft: Partial<Invoice>) => void;
}

export function InvoiceAIAssistant({
  currentInvoice,
  onApplyDraft,
}: InvoiceAIAssistantProps) {
  const run = usePrivateRequests(), locked = useRef(false), latest = useRef(currentInvoice);
  latest.current = currentInvoice;
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseMessage, setResponseMessage] = useState<string>(
    `I can draft or update this invoice for you. Try typing something like:\n\n**"Invoice Example Client for 1 unit of consultation at PKR 1,200, due in 30 days"**`
  );

  async function handleSend() {
    if (!prompt.trim() || locked.current) return;
    locked.current = true;
    const original = currentInvoice;
    const query = prompt.trim();
    setPrompt('');
    setIsGenerating(true);

    try {
      const editable = Object.fromEntries(Object.entries(invoiceAIChangesSchema.shape).flatMap(([key, schema]) => {
        const value = currentInvoice[key as keyof Invoice];
        return value !== undefined && schema.safeParse(value).success ? [[key, value]] : [];
      }));
      const payload = await run(signal => api.generateInvoiceWithAI(query, editable, signal));
      if (latest.current !== original) { setResponseMessage('The invoice changed while AI was drafting. Your edits were kept; ask again using the current draft.'); setPrompt(query); return; }
      if (payload.draft) {
        onApplyDraft(Object.fromEntries(Object.entries(payload.draft).filter(([,value]) => value !== undefined)) as Partial<Invoice>);
      }
      if (payload.assistantMessage) {
        setResponseMessage(payload.assistantMessage);
      }
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError') return;
      setPrompt(query);
      setResponseMessage(failure instanceof Error ? failure.message : 'Invoice AI could not prepare a draft. Continue editing manually.');
    } finally {
      locked.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <div className={s.aiDock} aria-label="Raqam AI Invoice Assistant">
      {/* Response Bubble & Controls */}
      <div className={s.aiHeader}>
        <div className={s.aiResponseBubble}>
          {responseMessage.split('\n\n').map((paragraph, index) => (
            <p key={index} style={{ margin: index === 0 ? '0 0 8px 0' : '0' }}>
              {paragraph.includes('**') ? (
                <>
                  {paragraph.split('**').map((chunk, i) =>
                    i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk
                  )}
                </>
              ) : (
                paragraph
              )}
            </p>
          ))}
        </div>

      </div>

      <form className={s.gradientInputCapsule} onSubmit={event => { event.preventDefault(); void handleSend(); }}>
        <div className={s.innerInputCapsule}>
          <input className={s.aiInput} aria-label="Invoice instructions" placeholder="Describe the invoice..." value={prompt}
            onChange={event => setPrompt(event.target.value)} disabled={isGenerating} maxLength={3000}/>
          <button className={s.blackPillButton} type="submit" disabled={isGenerating || !prompt.trim()}>
            {isGenerating ? 'Drafting...' : 'Draft invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
