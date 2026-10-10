'use client';

import { useRef, useState } from 'react';
import { invoiceTotals, invoiceLineAmount } from '../../../lib/invoice-money.ts';
import { parseAmount, formatAmount } from '../../../lib/server/money.ts';
import type { Invoice, InvoiceItem } from '../../../lib/contracts/invoices.ts';
import { InvoiceAIAssistant } from './invoice-ai-assistant.tsx';
import s from './invoices.module.css';

interface InvoiceEditorProps {
  initialInvoice?: Invoice | null;
  onSave: (invoice: Partial<Invoice>) => Promise<void>;
  onCancel: () => void;
  businessName?: string; workspaceCurrency?: string; demo?: boolean;
}

export function InvoiceEditor({
  initialInvoice,
  onSave,
  onCancel, businessName = '', workspaceCurrency = 'PKR', demo = false,
}: InvoiceEditorProps) {
  const [invoice, setInvoice] = useState<Partial<Invoice>>(() => {
    if (initialInvoice) return initialInvoice;
    return {
      id: crypto.randomUUID(),
      invoiceNumber: `INV-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
      status: 'draft',
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      fromName: businessName,
      fromAddress: '',
      fromContact: '',
      clientName: '',
      clientAddress: '',
      clientContact: '',
      currency: workspaceCurrency,
      discountMinor: '0',
      shippingMinor: '0',
      taxMinor: '0',
      items: [
        {
          id: crypto.randomUUID(),
          position: 0,
          description: 'Service',
          quantity: 1,
          rateMinor: '0',
          amountMinor: '0',
        },
      ],
    };
  });

  const [showAssistant, setShowAssistant] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState('');
  const currency = invoice.currency || workspaceCurrency;
  const [showSupplyDate, setShowSupplyDate] = useState(Boolean(invoice.supplyDate));
  const [showTaxIdFrom, setShowTaxIdFrom] = useState(Boolean(invoice.fromTaxId));
  const [showTaxIdTo, setShowTaxIdTo] = useState(Boolean(invoice.clientTaxId));
  const [showPaymentLink, setShowPaymentLink] = useState(Boolean(invoice.paymentLink));
  const [showPaymentDetails, setShowPaymentDetails] = useState(Boolean(invoice.paymentDetails));

  // Compute live subtotal and total
  const items = invoice.items || [];
  let totals: ReturnType<typeof invoiceTotals> | null = null;
  try { totals = invoiceTotals(items, invoice.discountMinor ?? '0', invoice.shippingMinor ?? '0', invoice.taxMinor ?? '0'); } catch { /* Invalid drafts cannot be saved. */ }
  const subtotal = totals ? formatAmount(totals.subtotalMinor) : 'Invalid amount';
  const grandTotal = totals ? formatAmount(totals.totalMinor) : 'Invalid amount';
  const discount = formatAmount(invoice.discountMinor ?? '0'), shipping = formatAmount(invoice.shippingMinor ?? '0'), tax = formatAmount(invoice.taxMinor ?? '0');

  function updateField<K extends keyof Invoice>(field: K, value: Invoice[K]) {
    setInvoice((prev) => ({ ...prev, [field]: value }));
  }

  function updateItem(index: number, key: keyof InvoiceItem, value: unknown) {
    const nextItems = [...items];
    const target = { ...nextItems[index]! };
    if (key === 'quantity') {
      const quantity = Number(value);
      if (!String(value).trim() || !Number.isFinite(quantity) || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || quantity > 100000) { setError('Use a nonnegative quantity with at most two decimals.'); return; }
      target.quantity = quantity;
    } else if (key === 'rateMinor') {
      const amount = parseAmount(String(value));
      if (amount === null) { setError('Enter a nonnegative rate with at most two decimals.'); return; }
      target.rateMinor = amount;
    } else if (key === 'description') {
      target.description = String(value);
    }
    try { target.amountMinor = invoiceLineAmount(target.quantity, target.rateMinor); } catch { setError('Line amount exceeds the supported range.'); return; }
    setError('');
    nextItems[index] = target as InvoiceItem;
    updateField('items', nextItems);
  }

  function addItem() {
    const nextItems = [
      ...items,
      {
        id: crypto.randomUUID(),
        position: items.length,
        description: 'New Service Item',
        quantity: 1,
        rateMinor: '0',
        amountMinor: '0',
      },
    ];
    updateField('items', nextItems);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    const nextItems = items.filter((_, i) => i !== index);
    updateField('items', nextItems);
  }

  function handleApplyAIDraft(draft: Partial<Invoice>) {
    if (saving) return;
    setInvoice(prev => ({ ...prev, ...draft }));
  }
  async function handleSubmit() {
    if (saveLock.current || demo) return;
    if (!totals) { setError('Check line amounts and discounts before saving.'); return; }
    saveLock.current = true; setSaving(true); setError('');
    try { await onSave({ ...invoice, currency, subtotalMinor: totals.subtotalMinor, totalMinor: totals.totalMinor }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invoice could not be saved. Your draft is preserved.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function adjustment(field: 'discountMinor' | 'shippingMinor' | 'taxMinor', value: string) {
    const amount = parseAmount(value);
    if (amount === null) { setError('Enter an exact nonnegative amount with at most two decimals.'); return; }
    updateField(field, amount); setError('');
  }

  const currencySymbol = currency === 'PKR' ? 'PKR ' : '$';

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '160px' }}>
      {error && <p role="alert">{error}</p>}
      {demo && <p>Example invoice editor. Open your workspace to save or use AI.</p>}
      {/* Floating Canvas Top Toolbar (Image 3) */}
      <div className={s.canvasToolbar}>
        <div className={s.toolbarGroup}>
          <button
            className={s.toolIconButton}
            style={{ color: showAssistant ? '#9333ea' : '#4b5563' }}
            title="Ask Raqam AI"
            type="button"
            onClick={() => setShowAssistant((prev) => !prev)}
          >
            ✦
          </button>
        </div>

        <div className={s.toolbarGroup}>
          <button className={s.toolIconButton} title="Print or download" type="button" onClick={() => window.print()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <button
            className={s.blackPillButton}
            type="button"
            onClick={handleSubmit}
            disabled={saving || demo}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
            {saving ? 'Saving...' : 'Save invoice'}
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              fontSize: '13px',
              color: '#6b7280',
              cursor: 'pointer',
              marginLeft: '6px',
            }}
            type="button"
            onClick={onCancel} disabled={saving}
          >
            Back
          </button>
        </div>
      </div>

      {/* Invoice Document Canvas (Image 3) */}
      <div className={s.canvasDocument}>
        {/* Top Grid: Logo, Title, Dates */}
        <div className={s.canvasTopGrid}>
          <div className={s.logoDashedBox} title="Logo upload unavailable">
            + Logo
          </div>

          <div className={s.docTitleBlock}>
            <div className={s.docTitle}>Invoice</div>
            <div className={s.docNumber}># {invoice.invoiceNumber || 'INV-26-0004'}</div>
            <button
              className={s.addTextLink}
              type="button"
              onClick={() => {
                const note = prompt('Add invoice note:', invoice.note || '');
                if (note !== null) updateField('note', note);
              }}
            >
              + {invoice.note ? `Note: ${invoice.note}` : 'Note'}
            </button>
          </div>

          <div className={s.datesBlock}>
            <div className={s.dateRow}>
              <span>Issue Date:</span>
              <input
                type="date"
                className={s.editableInput}
                value={invoice.issueDate || '2026-10-10'}
                onChange={(e) => updateField('issueDate', e.target.value)}
              />
            </div>
            <div className={s.dateRow}>
              <span>Due Date:</span>
              <input
                type="date"
                className={s.editableInput}
                value={invoice.dueDate || '2026-10-24'}
                onChange={(e) => updateField('dueDate', e.target.value)}
              />
            </div>
            {showSupplyDate ? (
              <div className={s.dateRow}>
                <span>Supply Date:</span>
                <input
                  type="date"
                  className={s.editableInput}
                  value={invoice.supplyDate || ''}
                  onChange={(e) => updateField('supplyDate', e.target.value)}
                />
              </div>
            ) : (
              <button
                className={s.addTextLink}
                style={{ textAlign: 'right', justifyContent: 'flex-end' }}
                type="button"
                onClick={() => setShowSupplyDate(true)}
              >
                + Supply Date
              </button>
            )}
          </div>
        </div>

        {/* Parties Grid: From and Bill To */}
        <div className={s.partiesGrid}>
          {/* From Column */}
          <div className={s.partyCol}>
            <div className={s.partyLabel}>From</div>
            <input
              className={`${s.editableInput} ${s.partyName}`}
              value={invoice.fromName || ''}
              onChange={(e) => updateField('fromName', e.target.value)}
              placeholder="Your Business Name"
            />
            <input
              className={s.editableInput}
              value={invoice.fromAddress || ''}
              onChange={(e) => updateField('fromAddress', e.target.value)}
              placeholder="Company Address"
            />
            <input
              className={s.editableInput}
              value={invoice.fromContact || ''}
              onChange={(e) => updateField('fromContact', e.target.value)}
              placeholder="Company Contact Info"
            />
            {showTaxIdFrom ? (
              <input
                className={s.editableInput}
                value={invoice.fromTaxId || ''}
                onChange={(e) => updateField('fromTaxId', e.target.value)}
                placeholder="Business Tax ID"
              />
            ) : (
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => setShowTaxIdFrom(true)}
              >
                + Business Tax Number
              </button>
            )}
          </div>

          {/* Bill To Column */}
          <div className={s.partyCol}>
            <div className={s.partyLabel}>Bill To</div>
            <input
              className={`${s.editableInput} ${s.partyName}`}
              value={invoice.clientName || ''}
              onChange={(e) => updateField('clientName', e.target.value)}
              placeholder="Client Name"
            />
            <input
              className={s.editableInput}
              value={invoice.clientAddress || ''}
              onChange={(e) => updateField('clientAddress', e.target.value)}
              placeholder="Client Address"
            />
            <input
              className={s.editableInput}
              value={invoice.clientContact || (invoice.clientEmail || '')}
              onChange={(e) => updateField('clientContact', e.target.value)}
              placeholder="Client Contact Info"
            />
            {showTaxIdTo ? (
              <input
                className={s.editableInput}
                value={invoice.clientTaxId || ''}
                onChange={(e) => updateField('clientTaxId', e.target.value)}
                placeholder="Client Tax ID"
              />
            ) : (
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => setShowTaxIdTo(true)}
              >
                + Business Tax Number
              </button>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div>
          <table className={s.itemsTable}>
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Description</th>
                <th style={{ width: '15%' }}>Qty</th>
                <th style={{ width: '18%' }}>Rate</th>
                <th style={{ width: '17%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const rateDisplay = formatAmount(item.rateMinor);
                let amountDisplay = 'Invalid amount';
                try { amountDisplay = formatAmount(invoiceLineAmount(item.quantity, item.rateMinor)); } catch { /* Visible draft error. */ }
                return (
                  <tr key={item.id || index}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          className={s.editableInput}
                          style={{ width: '100%', fontWeight: 500 }}
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#9ca3af',
                              cursor: 'pointer',
                              padding: '2px 6px',
                            }}
                            title="Remove line"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        className={s.editableInput}
                        style={{ width: '60px', textAlign: 'right' }}
                        value={item.quantity}
                        min="0"
                        step="0.01"
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                        <span>{currencySymbol}</span>
                        <input
                          type="number"
                          className={s.editableInput}
                          style={{ width: '80px', textAlign: 'right' }}
                          value={rateDisplay}
                          step="0.01"
                          onChange={(e) => updateItem(index, 'rateMinor', e.target.value)}
                        />
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {currencySymbol}{amountDisplay}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            className={s.addTextLink}
            style={{ marginTop: '12px', fontWeight: 500 }}
            type="button"
            onClick={addItem}
          >
            + Item
          </button>
        </div>

        {/* Bottom Section: Payment Details on Left, Totals & Signature on Right */}
        <div className={s.canvasBottomGrid}>
          {/* Left Block */}
          <div className={s.paymentDetailsBlock}>
            {showPaymentLink ? (
              <div>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Payment Link:</span>
                <input
                  className={s.editableInput}
                  style={{ width: '100%' }}
                  value={invoice.paymentLink || ''}
                  onChange={(e) => updateField('paymentLink', e.target.value)}
                  placeholder="https://pay.example.com/inv-..."
                />
              </div>
            ) : (
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => setShowPaymentLink(true)}
              >
                + Payment Link
              </button>
            )}

            {showPaymentDetails ? (
              <div style={{ marginTop: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Payment Details:</span>
                <textarea
                  className={s.editableInput}
                  style={{ width: '100%', minHeight: '48px' }}
                  value={invoice.paymentDetails || ''}
                  onChange={(e) => updateField('paymentDetails', e.target.value)}
                  placeholder="Bank name, IBAN, SWIFT, Account title..."
                />
              </div>
            ) : (
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => setShowPaymentDetails(true)}
              >
                + Payment Details
              </button>
            )}
          </div>

          {/* Right Block: Totals & Signature */}
          <div className={s.totalsBlock}>
            <div className={s.totalsRow}>
              <span>Subtotal</span>
              <span>{currencySymbol}{subtotal}</span>
            </div>

            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#6b7280' }}>
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => {
                  const val = prompt('Discount amount:', discount);
                  if (val !== null) adjustment('discountMinor', val);
                }}
              >
                + Discount
              </button>
              <span>·</span>
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => {
                  const val = prompt('Shipping amount:', shipping);
                  if (val !== null) adjustment('shippingMinor', val);
                }}
              >
                + Shipping
              </button>
              <span>·</span>
              <button
                className={s.addTextLink}
                type="button"
                onClick={() => {
                  const val = prompt('Tax amount:', tax);
                  if (val !== null) adjustment('taxMinor', val);
                }}
              >
                + Tax
              </button>
            </div>

            <div className={s.totalsRowFinal}>
              <span>Total</span>
              <span>{currencySymbol}{grandTotal}</span>
            </div>

            {/* Signature Box */}
            <div className={s.signatureBox} title="Signature upload unavailable">
              + Signature
            </div>
          </div>
        </div>
      </div>

      {/* Floating Raqam AI Dock */}
      {showAssistant && !demo && !saving && (
        <InvoiceAIAssistant
          currentInvoice={invoice}
          onApplyDraft={handleApplyAIDraft}
        />
      )}
    </div>
  );
}
