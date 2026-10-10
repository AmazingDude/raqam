import 'server-only';
import { z } from 'zod';
import type { RequestSession } from './auth.ts';
import { BackendError } from './errors.ts';
import { invoiceSchema, invoiceUpsertInputSchema, type Invoice, type InvoiceStatus, type InvoiceUpsertInput, type InvoicesSummary } from '../contracts/invoices.ts';
import { invoiceTotals } from '../invoice-money.ts';

function databaseError(code?: string): BackendError {
  if (code === 'P0002') return new BackendError('NOT_FOUND', 'Invoice not found in this workspace.');
  if (['PT409','23505'].includes(code ?? '')) return new BackendError('CONFLICT', 'This invoice changed or its number is already used. Reload before saving.');
  if (['22023','23514','22003','22P02','23502'].includes(code ?? '')) return new BackendError('INVALID_INPUT', 'Check the invoice fields, quantity precision and totals.');
  if (['42P01','42883','PGRST202','PGRST205'].includes(code ?? '')) return new BackendError('UNAVAILABLE', 'Invoice storage is not ready. Apply the pending invoice migrations before saving.');
  return new BackendError('UNAVAILABLE', 'The invoice operation could not complete. Your draft is preserved.');
}
function camel(key: string) { return key.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase()); }
function camelRecord(row: Record<string, unknown>) { return Object.fromEntries(Object.entries(row).map(([key,value]) => [camel(key),value])); }
export function mapInvoice(row: unknown, workspaceId: string): Invoice {
  const raw = z.record(z.string(), z.unknown()).safeParse(row);
  if (!raw.success || !Array.isArray(raw.data.items)) throw databaseError();
  const mapped = camelRecord(raw.data);
  mapped.items = raw.data.items.map(item => {
    if (typeof item !== 'object' || item === null) return item;
    const fields = item as Record<string,unknown>;
    // Earlier deployed snapshot functions retained table metadata. Verify its
    // ownership before removing only these known database-only fields.
    if ('workspace_id' in fields && fields.workspace_id !== workspaceId) throw databaseError();
    const {workspace_id:_workspace,created_at:_created,...line} = fields;
    return camelRecord(line);
  });
  const parsed = invoiceSchema.safeParse(mapped);
  if (!parsed.success) {
    console.error('[invoices] Invalid database snapshot', parsed.error.issues.map(issue => ({code:issue.code,path:issue.path.join('.')})));
    throw databaseError();
  }
  if (parsed.data.workspaceId !== workspaceId || parsed.data.items.some(item => item.invoiceId !== parsed.data.id)) throw databaseError();
  try {
    const totals = invoiceTotals(parsed.data.items, parsed.data.discountMinor, parsed.data.shippingMinor, parsed.data.taxMinor);
    if (totals.subtotalMinor !== parsed.data.subtotalMinor || totals.totalMinor !== parsed.data.totalMinor || parsed.data.items.some((item,i) => item.amountMinor !== totals.amounts[i])) throw new Error('Totals mismatch');
  } catch { throw databaseError(); }
  return parsed.data;
}
export function computeInvoicesSummary(invoices: Invoice[], currency = 'PKR', now = new Date()): InvoicesSummary {
  const summary: InvoicesSummary = { currency, period: now.toISOString().slice(0,7), sentMinor:'0',sentCount:0,paidMinor:'0',paidCount:0,
    overdueMinor:'0',overdueDueNowMinor:'0',overdueDueNowCount:0,overdueNextWeekMinor:'0',overdueNextWeekCount:0,
    overdueFutureMinor:'0',overdueFutureCount:0,cashflow:Array.from({length:31},(_,i)=>({day:i+1,amountMinor:'0'})) };
  const today = now.toISOString().slice(0,10), nextWeek = new Date(now.getTime()+7*86400000).toISOString().slice(0,10);
  const add = (field: 'sentMinor'|'paidMinor'|'overdueMinor'|'overdueDueNowMinor'|'overdueNextWeekMinor'|'overdueFutureMinor', value:string) => { summary[field]=(BigInt(summary[field])+BigInt(value)).toString(); };
  for (const invoice of invoices.filter(item => item.currency === currency)) {
    if (invoice.status === 'paid') {
      add('paidMinor',invoice.totalMinor); summary.paidCount++;
      if (invoice.issueDate.startsWith(summary.period)) {
        const bucket=summary.cashflow[Number(invoice.issueDate.slice(8,10))-1]!;
        bucket.amountMinor=(BigInt(bucket.amountMinor)+BigInt(invoice.totalMinor)).toString();
      }
    } else if (invoice.status === 'sent' || invoice.status === 'overdue') {
      if (invoice.status === 'sent') { add('sentMinor',invoice.totalMinor); summary.sentCount++; }
      if (invoice.dueDate < today) add('overdueMinor',invoice.totalMinor);
      if (invoice.dueDate <= today) { add('overdueDueNowMinor',invoice.totalMinor); summary.overdueDueNowCount++; }
      else if (invoice.dueDate <= nextWeek) { add('overdueNextWeekMinor',invoice.totalMinor); summary.overdueNextWeekCount++; }
      else { add('overdueFutureMinor',invoice.totalMinor); summary.overdueFutureCount++; }
    }
  }
  return summary;
}
async function rpc(session: RequestSession, name: string, parameters: Record<string,unknown>) {
  const result = await session.database.rpc(name,parameters);
  if (result.error) {
    console.error('[invoices] RPC failed', {operation:name,code:/^[A-Z0-9]{5,12}$/.test(result.error.code ?? '') ? result.error.code : 'UNKNOWN'});
    throw databaseError(result.error.code);
  }
  return result.data as unknown;
}
export async function listInvoices(session: RequestSession, workspaceId: string, currency = 'PKR') {
  const data = await rpc(session,'read_workspace_invoices',{p_workspace_id:workspaceId});
  if (!Array.isArray(data) || data.length > 1000) throw databaseError();
  const items = data.map(row => mapInvoice(row,workspaceId));
  if (new Set(items.map(item=>item.id)).size !== items.length) throw databaseError();
  return {items,summary:computeInvoicesSummary(items,currency)};
}
export async function createOrUpdateInvoice(session: RequestSession, workspaceId: string, input: InvoiceUpsertInput, currency = 'PKR', businessName = ''): Promise<Invoice> {
  const parsedInput = invoiceUpsertInputSchema.safeParse(input);
  if (!parsedInput.success) throw new BackendError('INVALID_INPUT','Check the invoice fields and use quantities with at most two decimals.');
  const saved = input.id ? await rpc(session,'read_workspace_invoice',{p_workspace_id:workspaceId,p_invoice_id:input.id}) : null;
  const previous = saved ? mapInvoice(saved,workspaceId) : null;
  if (previous && input.expectedVersion === undefined && previous.reviewVersion === 0) {
    // A create can commit before its response fails. A complete, identical
    // retry reads the original result; it never writes or overwrites an edit.
    const fields = ['invoiceNumber','status','issueDate','dueDate','fromName','clientName','currency'] as const;
    const sameFields = fields.every(key => parsedInput.data[key] !== undefined) && Object.entries(parsedInput.data)
      .every(([key,value]) => key === 'items' || value === previous[key as keyof Invoice]);
    const sameLines = input.items.length === previous.items.length && input.items.every((item,index) => {
      const old = previous.items[index]!;
      return item.id === old.id && item.description === old.description && item.quantity === old.quantity && item.rateMinor === old.rateMinor;
    });
    if (sameFields && sameLines) return previous;
  }
  if (previous && input.expectedVersion === undefined) throw new BackendError('CONFLICT','Reload the invoice before editing its saved version.');
  if (!previous && input.expectedVersion !== undefined) throw new BackendError('NOT_FOUND','Invoice not found. Reload the list.');
  const {expectedVersion: _version, ...changes} = parsedInput.data;
  const now = new Date(), today=now.toISOString().slice(0,10);
  let invoice: Invoice;
  try {
    const totals = invoiceTotals(input.items,input.discountMinor ?? previous?.discountMinor ?? '0',input.shippingMinor ?? previous?.shippingMinor ?? '0',input.taxMinor ?? previous?.taxMinor ?? '0');
    invoice = invoiceSchema.parse({ id:input.id ?? crypto.randomUUID(),workspaceId,invoiceNumber:`INV-${crypto.randomUUID().slice(0,12).toUpperCase()}`,
      status:'draft',issueDate:today,dueDate:new Date(now.getTime()+14*86400000).toISOString().slice(0,10),fromName:businessName,clientName:'',currency,
      discountMinor:'0',shippingMinor:'0',taxMinor:'0',remindersEnabled:false,viewsCount:0,reviewVersion:0,...previous,...changes,
      subtotalMinor:totals.subtotalMinor,totalMinor:totals.totalMinor,items:input.items.map((item,position)=>({...item,id:item.id ?? crypto.randomUUID(),position,amountMinor:totals.amounts[position]})) });
  } catch { throw new BackendError('INVALID_INPUT','Enter a sender, client, valid dates, line descriptions and exact amounts. Discount cannot exceed the invoice total.'); }
  if (invoice.currency !== currency) throw new BackendError('INVALID_INPUT',`Use your workspace currency (${currency}) for this invoice.`);
  const {items,createdAt:_created,updatedAt:_updated,reviewVersion:_review,viewsCount:_views,...fields}=invoice;
  const snake=(key:string)=>key.replace(/[A-Z]/g,char=>`_${char.toLowerCase()}`);
  const payload: Record<string,unknown>=Object.fromEntries(Object.entries(fields).map(([key,value])=>[snake(key),value]));
  payload.items=items.map(({invoiceId:_invoiceId,...item})=>Object.fromEntries(Object.entries(item).map(([key,value])=>[snake(key),value])));
  return mapInvoice(await rpc(session,'save_workspace_invoice',{p_workspace_id:workspaceId,p_invoice:payload,p_expected_version:input.expectedVersion ?? null}),workspaceId);
}
export async function updateInvoiceStatus(session: RequestSession, workspaceId: string, invoiceId: string, status: InvoiceStatus, expectedVersion: number) {
  return mapInvoice(await rpc(session,'set_workspace_invoice_status',{p_workspace_id:workspaceId,p_invoice_id:invoiceId,p_status:status,p_expected_version:expectedVersion}),workspaceId);
}
export async function deleteInvoice(session: RequestSession, workspaceId: string, invoiceId: string, expectedVersion: number) {
  const data=await rpc(session,'delete_workspace_invoice',{p_workspace_id:workspaceId,p_invoice_id:invoiceId,p_expected_version:expectedVersion});
  if (data !== invoiceId) throw databaseError();
}
