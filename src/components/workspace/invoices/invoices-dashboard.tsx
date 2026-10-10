'use client';

import { useState } from 'react';
import { money } from '../../../lib/client/presentation.ts';
import type { Invoice, InvoiceStatus, InvoicesSummary } from '../../../lib/contracts/invoices.ts';
import { CashflowChart } from './cashflow-chart.tsx';
import { AIOrb } from './ai-orb.tsx';
import s from './invoices.module.css';

interface InvoicesDashboardProps {
  invoices: Invoice[];
  summary: InvoicesSummary;
  loading?: boolean;
  busy?: boolean;
  onCreateNew: () => void;
  onEditInvoice: (invoice: Invoice) => void;
  onPreviewInvoice?: (invoice: Invoice) => void;
  onUpdateStatus: (id: string, status: InvoiceStatus) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
}

function getClientAvatarStyle(name: string): { bg: string; color: string } {
  const palette = [
    { bg: '#fee2e2', color: '#b91c1c' },
    { bg: '#fef3c7', color: '#b45309' },
    { bg: '#dcfce7', color: '#15803d' },
    { bg: '#e0e7ff', color: '#4338ca' },
    { bg: '#f3e8ff', color: '#7e22ce' },
    { bg: '#fae8ff', color: '#a21caf' },
    { bg: '#e0f2fe', color: '#0369a1' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index]!;
}

export function InvoicesDashboard({
  invoices,
  summary,
  loading = false, busy = false,
  onCreateNew,
  onEditInvoice,
  onPreviewInvoice,
  onUpdateStatus,
  onDeleteInvoice,
}: InvoicesDashboardProps) {
  const [search, setSearch] = useState('');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchNum = inv.invoiceNumber.toLowerCase().includes(q);
      const matchClient = inv.clientName.toLowerCase().includes(q);
      return matchNum || matchClient;
    }
    return true;
  });

  function formatDisplayDate(dateStr: string) {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = parseInt(parts[2]!, 10);
        const monthIndex = parseInt(parts[1]!, 10) - 1;
        return `${day} ${months[monthIndex] || ''}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  function formatMoney(amountMinor: string, currency = summary.currency) { return `${currency} ${money(amountMinor)}`; }

  return (
    <div className={s.container}>
      {/* 1. Announcement Banner */}

      {/* 2. Top Header with Title and Create Button */}
      <div className={s.header}>
        <h1 className={s.title}>Invoices</h1>
        <button className={s.createButton} type="button" onClick={onCreateNew} disabled={busy || loading}>
          <span>+</span> Create Invoice
        </button>
      </div>

      <p>Invoice totals in {summary.currency}. Statuses are owner-recorded; they do not confirm bank settlement.</p>
      {/* 3. Stat Cards & Cashflow Grid */}
      <div className={s.widgetsGrid}>
        {/* Sent Card */}
        <div className={`${s.widgetCard} ${s.cardSent}`}>
          <div className={s.widgetHeader}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            <span>Sent</span>
          </div>
          <div>
            <div className={s.widgetValue}>{formatMoney(summary.sentMinor)}</div>
            <div className={s.widgetSubtext}>{summary.sentCount} invoices</div>
          </div>
        </div>

        {/* Paid Card */}
        <div className={`${s.widgetCard} ${s.cardPaid}`}>
          <div className={s.widgetHeader}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Marked paid</span>
          </div>
          <div>
            <div className={s.widgetValue}>{formatMoney(summary.paidMinor)}</div>
            <div className={s.widgetSubtext}>{summary.paidCount} invoices</div>
          </div>
        </div>

        {/* Overdue Card */}
        <div className={`${s.widgetCard} ${s.cardOverdue}`}>
          <div className={s.widgetHeader}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Unpaid invoices</span>
          </div>
          <div className={s.overdueTiers}>
            <div className={s.tierBlock}>
              <div className={s.tierAmount}>{formatMoney(summary.overdueDueNowMinor)}</div>
              <div className={s.tierLabel}>Due now</div>
              <div className={s.tierCount}>{summary.overdueDueNowCount} invoices</div>
            </div>
            <div className={s.tierBlock}>
              <div className={s.tierAmount}>{formatMoney(summary.overdueNextWeekMinor)}</div>
              <div className={s.tierLabel}>Next week</div>
              <div className={s.tierCount}>{summary.overdueNextWeekCount} invoices</div>
            </div>
            <div className={s.tierBlock}>
              <div className={s.tierAmount}>{formatMoney(summary.overdueFutureMinor)}</div>
              <div className={s.tierLabel}>Future</div>
              <div className={s.tierCount}>{summary.overdueFutureCount} invoices</div>
            </div>
          </div>
        </div>

        {/* Cashflow Chart Card */}
        <div className={s.cashflowCard}>
          <div className={s.cashflowTop}>
            <div className={s.cashflowTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              <span>Marked paid by issue date</span>
            </div>
            <div className={s.cashflowSelectors}>
              <div className={s.selectPill}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{summary.period}</span>
              </div>
              <div className={s.selectPill}>
                <span>{summary.currency}</span>
              </div>
            </div>
          </div>
          <div className={s.chartContainer}>
            <CashflowChart points={summary.cashflow} currency={summary.currency} />
          </div>
        </div>
      </div>

      {/* 4. Filter and Search Controls */}
      <div className={s.controlsRow}>
        <button
          className={s.filterButton}
          type="button"
          onClick={() => {
            if (statusFilter) setStatusFilter(null);
            else setStatusFilter('draft');
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {statusFilter ? `Filtered: ${statusFilter}` : '+ Add Filter'}
        </button>

        <div className={s.searchWrap}>
          <svg className={s.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={s.searchInput}
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 5. Invoices Data Table */}
      <div className={s.tableCard}>
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Date</th>
              <th style={{ width: '14%' }}>Status</th>
              <th style={{ width: '18%' }}>Invoice</th>
              <th style={{ width: '16%' }}>Reminders</th>
              <th style={{ width: '18%' }}>Bill To</th>
              <th style={{ width: '10%' }}>Views</th>
              <th style={{ width: '10%' }}>Total</th>
              <th style={{ width: '2%' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#6b7280' }}>
                  Loading invoices...
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#6b7280' }}>
                  No invoices found. Click <strong>+ Create Invoice</strong> or ask Raqam AI to create one!
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => {
                const isDraft = inv.status === 'draft';
                const isPaid = inv.status === 'paid';
                const isSent = inv.status === 'sent';
                const isOverdue = inv.status === 'overdue';

                const clientInitial = inv.clientName ? inv.clientName.trim()[0]?.toUpperCase() : 'C';
                const avatarStyle = getClientAvatarStyle(inv.clientName || 'Client');

                return (
                  <tr key={inv.id}>
                    <td>{formatDisplayDate(inv.issueDate)}</td>

                    {/* Interactive Status Pill */}
                    <td style={{ position: 'relative' }}>
                      <button
                        type="button"
                        disabled={busy || isPaid}
                        aria-label={`Change status for ${inv.invoiceNumber}`}
                        aria-expanded={activeDropdownId === inv.id}
                        className={`${s.statusPill} ${
                          isDraft ? s.statusDraft : isPaid ? s.statusPaid : isSent ? s.statusSent : s.statusOverdue
                        }`}
                        onClick={() =>
                          !busy && !isPaid && setActiveDropdownId((prev) => (prev === inv.id ? null : inv.id))
                        }
                      >
                        {isDraft && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        )}
                        {isPaid && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {isSent && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                          </svg>
                        )}
                        {isOverdue && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        )}
                        <span>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)} ⌄</span>
                      </button>

                      {/* Dropdown Menu */}
                      {activeDropdownId === inv.id && (
                        <div className={s.dropdownMenu}>
                          {(['draft', 'sent', 'overdue'] as InvoiceStatus[]).map((st) => (
                            <button
                              key={st}
                              disabled={busy || (st === 'paid' && inv.status !== 'paid')}
                              title={st === 'paid' && inv.status !== 'paid' ? 'Link a verified payment before marking this invoice settled.' : undefined}
                              className={s.dropdownItem}
                              type="button"
                              onClick={async () => {
                                setActiveDropdownId(null);
                                await onUpdateStatus(inv.id, st);
                              }}
                            >
                              <span>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    <td style={{ fontWeight: 500 }}>
                      <button type="button" className={s.moreButton} disabled={busy} onClick={() => onEditInvoice(inv)} aria-label={`Edit ${inv.invoiceNumber}`}>{inv.invoiceNumber}</button>
                    </td>

                    <td>
                      {inv.remindersEnabled ? (
                        <span style={{ color: '#4f46e5', fontSize: '13px', fontWeight: 500 }}>
                          Reminder preference
                        </span>
                      ) : (
                        <span style={{ color: '#6366f1', fontSize: '13px', cursor: 'pointer' }}>
                          Reminders unavailable
                        </span>
                      )}
                    </td>

                    <td>
                      <div className={s.clientBadge}>
                        <div
                          className={s.clientAvatar}
                          style={{ backgroundColor: avatarStyle.bg, color: avatarStyle.color }}
                        >
                          {clientInitial}
                        </div>
                        <span>{inv.clientName}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="12" width="4" height="8" />
                          <rect x="10" y="8" width="4" height="12" />
                          <rect x="17" y="4" width="4" height="16" />
                        </svg>
                        <span>{inv.viewsCount}</span>
                      </div>
                    </td>

                    <td style={{ fontWeight: 600 }}>{formatMoney(inv.totalMinor, inv.currency)}</td>

                    <td>
                      {onPreviewInvoice && <button type="button" className={s.moreButton} disabled={busy} onClick={() => onPreviewInvoice(inv)} aria-label={`Preview and download ${inv.invoiceNumber}`}>Preview / download</button>}
                      <button
                        className={s.moreButton}
                        type="button"
                        title={`Delete ${inv.invoiceNumber}`}
                        aria-label={`Delete ${inv.invoiceNumber}`}
                        disabled={busy}
                        onClick={() => {
                          const action = confirm(`Delete ${inv.invoiceNumber}?`);
                          if (action) {
                            onDeleteInvoice(inv.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 6. Floating AI Orb at Bottom (Clicking opens new invoice with Raqam AI) */}
      <div
        className={s.orbFloat}
        title="Create or ask Raqam AI to draft an invoice"
        onClick={() => { if (!busy && !loading) onCreateNew(); }}
      >
        <AIOrb size={44} />
      </div>
    </div>
  );
}
