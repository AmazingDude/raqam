import { z } from 'zod';
import { dateSchema, minorUnitsSchema } from './schemas.ts';
import { invoiceTotals } from '../invoice-money.ts';

export const INVOICE_STATUSES = ['draft', 'sent', 'overdue', 'paid'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];
export const invoiceQuantitySchema = z.number().finite().min(0).max(100000).refine(value => /^\d+(?:\.\d{1,2})?$/.test(String(value)), 'Use a quantity with at most two decimals');

export const invoiceItemSchema = z.strictObject({
  id: z.string().min(1),
  invoiceId: z.string().min(1).optional(),
  position: z.number().int().min(0),
  description: z.string().trim().min(1).max(1000),
  quantity: invoiceQuantitySchema,
  rateMinor: minorUnitsSchema,
  amountMinor: minorUnitsSchema,
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoiceSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(64),
  status: z.enum(INVOICE_STATUSES),
  issueDate: dateSchema,
  dueDate: dateSchema,
  supplyDate: dateSchema.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),

  // Parties
  fromName: z.string().trim().min(1).max(200),
  fromAddress: z.string().max(1000).nullable().optional(),
  fromContact: z.string().max(500).nullable().optional(),
  fromTaxId: z.string().max(100).nullable().optional(),

  clientName: z.string().trim().min(1).max(200),
  clientEmail: z.string().email().max(255).nullable().optional().or(z.literal('')),
  clientAddress: z.string().max(1000).nullable().optional(),
  clientContact: z.string().max(500).nullable().optional(),
  clientTaxId: z.string().max(100).nullable().optional(),

  currency: z.string().min(3).max(4),
  subtotalMinor: minorUnitsSchema,
  discountMinor: minorUnitsSchema,
  shippingMinor: minorUnitsSchema,
  taxMinor: minorUnitsSchema,
  totalMinor: minorUnitsSchema,

  paymentLink: z.string().max(2000).nullable().optional(),
  paymentDetails: z.string().max(2000).nullable().optional(),
  signatureUrl: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().max(2000).nullable().optional(),
  remindersEnabled: z.boolean(),
  viewsCount: z.number().int().min(0),

  items: z.array(invoiceItemSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  reviewVersion: z.number().int().nonnegative(),
});
export type Invoice = z.infer<typeof invoiceSchema>;
export const verifiedInvoiceSchema = invoiceSchema.superRefine((invoice, ctx) => {
  try {
    const totals = invoiceTotals(invoice.items, invoice.discountMinor, invoice.shippingMinor, invoice.taxMinor);
    if (!invoice.items.length || invoice.items.length > 100 || new Set(invoice.items.map(item => item.id)).size !== invoice.items.length ||
      invoice.items.some((item, index) => item.position !== index || item.amountMinor !== totals.amounts[index]) ||
      totals.totalMinor !== invoice.totalMinor || totals.subtotalMinor !== invoice.subtotalMinor)
      ctx.addIssue({ code: 'custom', message: 'Invoice lines and totals must agree' });
  } catch { ctx.addIssue({ code: 'custom', message: 'Invoice money could not be verified' }); }
});

export const invoiceUpsertInputSchema = z.strictObject({
  id: z.string().uuid().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  invoiceNumber: z.string().trim().min(1).max(64).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  issueDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  supplyDate: dateSchema.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  fromName: z.string().trim().min(1).max(200).optional(),
  fromAddress: z.string().max(1000).nullable().optional(),
  fromContact: z.string().max(500).nullable().optional(),
  fromTaxId: z.string().max(100).nullable().optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  clientEmail: z.string().max(255).nullable().optional(),
  clientAddress: z.string().max(1000).nullable().optional(),
  clientContact: z.string().max(500).nullable().optional(),
  clientTaxId: z.string().max(100).nullable().optional(),
  currency: z.string().min(3).max(4).optional(),
  discountMinor: minorUnitsSchema.optional(),
  shippingMinor: minorUnitsSchema.optional(),
  taxMinor: minorUnitsSchema.optional(),
  paymentLink: z.string().max(2000).nullable().optional(),
  paymentDetails: z.string().max(2000).nullable().optional(),
  signatureUrl: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().max(2000).nullable().optional(),
  remindersEnabled: z.boolean().optional(),
  items: z.array(z.strictObject({
    id: z.string().optional(),
    description: z.string().trim().min(1).max(1000),
    quantity: invoiceQuantitySchema,
    rateMinor: minorUnitsSchema,
  })).min(1).max(100),
});
export type InvoiceUpsertInput = z.infer<typeof invoiceUpsertInputSchema>;

export const invoiceStatusUpdateSchema = z.strictObject({
  status: z.enum(INVOICE_STATUSES),
  expectedVersion: z.number().int().nonnegative(),
});
export const invoiceDeleteSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative() });

const summaryMinorSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const invoicesSummarySchema = z.strictObject({
  currency: z.string().regex(/^[A-Z]{3}$/),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  sentMinor: summaryMinorSchema,
  sentCount: z.number().int().min(0),
  paidMinor: summaryMinorSchema,
  paidCount: z.number().int().min(0),
  overdueMinor: summaryMinorSchema,
  overdueDueNowMinor: summaryMinorSchema,
  overdueDueNowCount: z.number().int().min(0),
  overdueNextWeekMinor: summaryMinorSchema,
  overdueNextWeekCount: z.number().int().min(0),
  overdueFutureMinor: summaryMinorSchema,
  overdueFutureCount: z.number().int().min(0),
  cashflow: z.array(z.strictObject({
    day: z.number().int().min(1).max(31),
    amountMinor: summaryMinorSchema,
  })),
});
export type InvoicesSummary = z.infer<typeof invoicesSummarySchema>;
export const invoicesListSchema = z.strictObject({ items: z.array(verifiedInvoiceSchema).max(1000), summary: invoicesSummarySchema });

export const invoiceAIChangesSchema = invoiceUpsertInputSchema.omit({ id: true, expectedVersion: true, invoiceNumber: true, status: true }).partial();
export const generateInvoiceAIRequestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(3000),
  currentDraft: invoiceAIChangesSchema.optional(),
});
export type GenerateInvoiceAIRequest = z.infer<typeof generateInvoiceAIRequestSchema>;

export const generateInvoiceAIResponseSchema = z.strictObject({
  draft: invoiceSchema.partial(),
  assistantMessage: z.string().min(1).max(2000),
  missingFields: z.array(z.string().max(100)).max(20),
});
export type GenerateInvoiceAIResponse = z.infer<typeof generateInvoiceAIResponseSchema>;
