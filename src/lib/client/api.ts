import { z } from 'zod';
import { transactionSchema } from '../contracts/schemas.ts';

export class ClientError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const workspaceSchema = z.object({ id: z.string(), ownerSubject: z.string(), businessName: z.string(), currency: z.literal('PKR') });
const transactionsSchema = z.object({ items: z.array(transactionSchema), nextCursor: z.string().nullable() });
const sourceSchema = z.object({ sourceId: z.string(), duplicate: z.boolean() });
const sourceLinkSchema = z.object({ sourceId: z.string(), signedUrl: z.url(), expiresInSeconds: z.number().positive() });

async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal, cache: 'no-store', credentials: 'same-origin' });
  const body: unknown = await response.json().catch(() => null);
  const envelope = z.object({ data: z.unknown(), error: z.object({ code: z.string(), message: z.string() }).nullable() }).safeParse(body);
  if (!envelope.success) throw new ClientError('UNAVAILABLE', 'The workspace returned an unreadable response. Retry in a moment.');
  if (envelope.data.error) throw new ClientError(envelope.data.error.code, envelope.data.error.message);
  if (!response.ok) throw new ClientError('UNAVAILABLE', 'This request could not be completed. Please retry.');
  const data = schema.safeParse(envelope.data.data);
  if (!data.success) throw new ClientError('UNAVAILABLE', 'The workspace returned unexpected records. Please reload.');
  return data.data;
}
export const api = {
  workspace: (signal: AbortSignal) => request('/api/workspace', workspaceSchema.nullable(), signal),
  createWorkspace: (businessName: string, signal: AbortSignal) => request('/api/workspace', workspaceSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName }),
  }),
  transactions: (signal: AbortSignal, cursor: string | null = null) => request(`/api/transactions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, transactionsSchema, signal),
  uploadSource: (file: File, signal: AbortSignal) => {
    const body = new FormData(); body.set('file', file);
    return request('/api/sources', sourceSchema, signal, { method: 'POST', body });
  },
  sourceLink: (id: string, signal: AbortSignal) => request(`/api/sources/${encodeURIComponent(id)}`, sourceLinkSchema, signal),
};
