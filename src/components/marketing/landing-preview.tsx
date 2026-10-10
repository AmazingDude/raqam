'use client';

import { useState } from 'react';
import { Icon } from '../ui/icon.tsx';
import s from './landing.module.css';

type Tab = 'cashbook' | 'evidence' | 'assistant';
type Filter = 'all' | 'reviewed' | 'pending';

const MOCK_ROWS = [
  {
    id: 'row-1',
    title: 'Brand identity · Aster Studio',
    date: '10 Oct 2026',
    category: 'Customer receipts',
    status: 'reviewed',
    amount: '+64,000.00',
    type: 'in',
    proof: 'Bank transfer · Ref 9401',
  },
  {
    id: 'row-2',
    title: 'Northstar Cloud subscription',
    date: '8 Oct 2026',
    category: 'Software & Tools',
    status: 'pending',
    amount: '−8,500.00',
    type: 'out',
    proof: 'Receipt attached · NS-101',
  },
  {
    id: 'row-3',
    title: 'October studio rent',
    date: '7 Oct 2026',
    category: 'Premises & utilities',
    status: 'reviewed',
    amount: '−12,500.00',
    type: 'out',
    proof: 'Direct debit receipt',
  },
  {
    id: 'row-4',
    title: 'Design retainer · K2 Ventures',
    date: '4 Oct 2026',
    category: 'Customer receipts',
    status: 'reviewed',
    amount: '+28,000.00',
    type: 'in',
    proof: 'Invoice INV-2026-08',
  },
  {
    id: 'row-5',
    title: 'High-speed fiber connection',
    date: '3 Oct 2026',
    category: 'Premises & utilities',
    status: 'pending',
    amount: '−6,500.00',
    type: 'out',
    proof: 'Bill scanned · PTCL-88',
  },
];

export function LandingPreview() {
  const [activeTab, setActiveTab] = useState<Tab>('cashbook');
  const [filter, setFilter] = useState<Filter>('all');
  const [evidenceMode, setEvidenceMode] = useState<'verified' | 'raw'>('verified');

  const filteredRows = MOCK_ROWS.filter((r) => {
    if (filter === 'reviewed') return r.status === 'reviewed';
    if (filter === 'pending') return r.status === 'pending';
    return true;
  });

  return (
    <div className={s.previewContainer} aria-label="Interactive Raqam preview">
      {/* Tab Navigation Bar */}
      <div className={s.previewTabsHeader}>
        <div className={s.previewTabGroup} role="tablist" aria-label="Feature preview tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cashbook'}
            className={`${s.previewTabBtn} ${activeTab === 'cashbook' ? s.previewTabBtnActive : ''}`}
            onClick={() => setActiveTab('cashbook')}
          >
            <Icon name="book" size={14} />
            <span>Cashbook Ledger</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'evidence'}
            className={`${s.previewTabBtn} ${activeTab === 'evidence' ? s.previewTabBtnActive : ''}`}
            onClick={() => setActiveTab('evidence')}
          >
            <Icon name="file" size={14} />
            <span>Receipt Evidence</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'assistant'}
            className={`${s.previewTabBtn} ${activeTab === 'assistant' ? s.previewTabBtnActive : ''}`}
            onClick={() => setActiveTab('assistant')}
          >
            <Icon name="spark" size={14} />
            <span>Grounded Assistant</span>
          </button>
        </div>

        <div className={s.previewMeta}>
          <span><strong>Sunday Studio</strong> (Demo)</span>
          <span className={s.previewTag}>Interactive Preview</span>
        </div>
      </div>

      {/* Tab 1: Cashbook View */}
      {activeTab === 'cashbook' && (
        <div className={s.previewPanel}>
          {/* Stat Cards */}
          <div className={s.cashbookStats}>
            <div className={s.statCard}>
              <div className={s.statLabel}>
                <span>Cash in · PKR</span>
                <span className={s.badgeReviewed}><Icon name="check" size={12} /> Verified</span>
              </div>
              <div className={`${s.statValue} ${s.statValueGreen}`}>92,000.00</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>
                <span>Cash out · PKR</span>
                <span className={s.badgeReviewed}><Icon name="check" size={12} /> Verified</span>
              </div>
              <div className={`${s.statValue} ${s.statValueRed}`}>27,500.00</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>
                <span>Net movement · PKR</span>
                <span style={{ fontSize: 11, color: '#9ba1ad' }}>October 2026</span>
              </div>
              <div className={`${s.statValue} ${s.statValueWhite}`}>+64,500.00</div>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`${s.ghostPill} ${filter === 'all' ? s.primaryPill : ''}`}
              style={{ padding: '4px 12px', fontSize: 12, minHeight: 32 }}
            >
              All Records ({MOCK_ROWS.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('reviewed')}
              className={`${s.ghostPill} ${filter === 'reviewed' ? s.primaryPill : ''}`}
              style={{ padding: '4px 12px', fontSize: 12, minHeight: 32 }}
            >
              Reviewed (3)
            </button>
            <button
              type="button"
              onClick={() => setFilter('pending')}
              className={`${s.ghostPill} ${filter === 'pending' ? s.primaryPill : ''}`}
              style={{ padding: '4px 12px', fontSize: 12, minHeight: 32 }}
            >
              Needs Review (2)
            </button>
          </div>

          {/* Rows */}
          <div className={s.cashbookRows}>
            {filteredRows.map((row) => (
              <div key={row.id} className={s.cashRow}>
                <div className={s.cashRowMeta}>
                  <div className={s.cashRowTitle}>{row.title}</div>
                  <div className={s.cashRowSub}>
                    <span>{row.date}</span>
                    <span>·</span>
                    <span>{row.category}</span>
                    <span>·</span>
                    {row.status === 'reviewed' ? (
                      <span className={s.badgeReviewed}>
                        <Icon name="check" size={11} /> Reviewed
                      </span>
                    ) : (
                      <span className={s.badgePending}>
                        <Icon name="review" size={11} /> AI Proposed
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div
                    className={s.cashRowAmount}
                    style={{ color: row.type === 'in' ? '#34d399' : '#ffffff' }}
                  >
                    {row.amount}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b92a0', textAlign: 'right', marginTop: 2 }}>
                    PKR
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Evidence & OCR View */}
      {activeTab === 'evidence' && (
        <div className={s.previewPanel}>
          <div className={s.evidenceGrid}>
            <div className={s.evidenceLeft}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className={s.evidenceHeading}>Transaction Verification</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setEvidenceMode('verified')}
                    className={`${s.ghostPill} ${evidenceMode === 'verified' ? s.primaryPill : ''}`}
                    style={{ padding: '3px 10px', fontSize: 11, minHeight: 28 }}
                  >
                    Verified State
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvidenceMode('raw')}
                    className={`${s.ghostPill} ${evidenceMode === 'raw' ? s.primaryPill : ''}`}
                    style={{ padding: '3px 10px', fontSize: 11, minHeight: 28 }}
                  >
                    Raw Model Output
                  </button>
                </div>
              </div>

              <div className={s.fieldRow}>
                <span className={s.fieldName}>Counterparty</span>
                <span className={s.fieldVal}>Northstar Cloud LLC</span>
              </div>
              <div className={s.fieldRow}>
                <span className={s.fieldName}>Transaction Date</span>
                <span className={s.fieldVal}>8 Oct 2026</span>
              </div>
              <div className={s.fieldRow}>
                <span className={s.fieldName}>Reference Code</span>
                <span className={s.fieldVal}>NS-101 (Matched)</span>
              </div>
              <div className={s.fieldRow}>
                <span className={s.fieldName}>Extracted Amount</span>
                <span className={s.fieldVal}>PKR 8,500.00 (Exact)</span>
              </div>
              <div className={s.fieldRow}>
                <span className={s.fieldName}>Assigned Category</span>
                <span className={s.fieldVal}>
                  Software & Subscriptions
                  <span className={s.badgeReviewed} style={{ marginLeft: 8 }}>Confirmed</span>
                </span>
              </div>
              <div className={s.fieldRow}>
                <span className={s.fieldName}>Integrity Status</span>
                <span className={s.fieldVal} style={{ color: '#34d399' }}>
                  <Icon name="check" size={14} /> 1-to-1 Match Locked
                </span>
              </div>
            </div>

            {/* Receipt Preview Paper */}
            <div className={s.receiptCard}>
              <div className={s.receiptHeader}>
                <div>
                  <div className={s.receiptTitle}>Northstar Cloud</div>
                  <div className={s.receiptSubtitle}>Receipt #NS-101 · Billed to Sunday Studio</div>
                </div>
                <span className={s.badgeReviewed} style={{ fontSize: 10 }}>OCR Grounded</span>
              </div>

              <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
                <div><strong>Service:</strong> Cloud Infrastructure Plan</div>
                <div><strong>Billing Date:</strong> 08-10-2026</div>
                <div><strong>Payment Method:</strong> Visa ending in 4092</div>
              </div>

              <div className={s.receiptTotalRow}>
                <div>
                  <span style={{ color: '#6b7280', display: 'block', fontSize: 11 }}>Settled in PKR</span>
                  <strong>Amount Paid</strong>
                </div>
                <div className={s.receiptTotalVal}>8,500.00</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Grounded Assistant View */}
      {activeTab === 'assistant' && (
        <div className={s.previewPanel}>
          <div className={s.assistantChat}>
            <div className={s.chatBubbleUser}>
              How much net cash movement did we record in October, and are there any unverified items?
            </div>

            <div className={s.chatBubbleAi}>
              <div className={s.chatToolBadge}>
                <Icon name="spark" size={13} />
                Executed: list_transactions(month=&quot;2026-10&quot;) &amp; get_cash_summary()
              </div>
              <p style={{ margin: '0 0 10px' }}>
                Based on your verified cashbook for <strong>October 2026</strong>:
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                <li><strong>Cash In:</strong> PKR 92,000.00 (from 2 customer payments)</li>
                <li><strong>Cash Out:</strong> PKR 27,500.00 (across 3 operating expenses)</li>
                <li><strong>Net Movement:</strong> <strong>+PKR 64,500.00</strong></li>
              </ul>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.06)' }}>
                <strong>Pending Action:</strong> You have <strong>2 records</strong> awaiting your explicit review: <em>Northstar Cloud (PKR 8,500.00)</em> and <em>High-speed fiber (PKR 6,500.00)</em>.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
