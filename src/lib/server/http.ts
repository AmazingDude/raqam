import { BackendError, HTTP_STATUS } from './errors.ts';

function parseOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function requireSameOrigin(request: Request, appUrl: string): void {
  const originHeader = request.headers.get('origin');
  const requestOrigin = parseOrigin(originHeader);
  if (!requestOrigin) throw new BackendError('INVALID_INPUT', 'This action must originate from the Raqam app.');

  const allowed = new Set<string>();

  const configuredOrigin = parseOrigin(appUrl);
  if (configuredOrigin) allowed.add(configuredOrigin);

  const requestUrlOrigin = parseOrigin(request.url);
  if (requestUrlOrigin) allowed.add(requestUrlOrigin);

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (forwardedHost) {
    const rawProto = request.headers.get('x-forwarded-proto');
    const firstProto = rawProto ? rawProto.split(',')[0]?.trim() : undefined;
    const proto = firstProto || (request.url.startsWith('https:') ? 'https' : 'http');
    const firstHost = forwardedHost.split(',')[0]?.trim();
    if (firstHost) {
      const hostOrigin = parseOrigin(`${proto}://${firstHost}`);
      if (hostOrigin) allowed.add(hostOrigin);
    }
  }

  for (const envVar of [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ]) {
    if (envVar?.trim()) {
      const v = envVar.trim();
      const vercelOrigin = parseOrigin(v.startsWith('http') ? v : `https://${v}`);
      if (vercelOrigin) allowed.add(vercelOrigin);
    }
  }

  if (!allowed.has(requestOrigin)) {
    throw new BackendError('INVALID_INPUT', 'This action must originate from the Raqam app.');
  }
}
export async function readRequestBytes(request: Request, maxBytes: number): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new BackendError('INVALID_INPUT', 'Request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new BackendError('INVALID_INPUT', 'Request body is too large.'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
export async function readJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new BackendError('INVALID_INPUT', 'Send a JSON request.');
  const body = await readRequestBytes(request, maxBytes);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new BackendError('INVALID_INPUT', 'Send valid UTF-8 JSON.'); }
}
export async function jsonEndpoint<T>(operation: () => Promise<T>, successStatus = 200): Promise<Response> {
  try { return Response.json({ data: await operation(), error: null }, { status: successStatus, headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const safe = error instanceof BackendError ? error : new BackendError('UNAVAILABLE', 'The operation could not complete. Please retry.');
    return Response.json({ data: null, error: { code: safe.code, message: safe.message } }, { status: HTTP_STATUS[safe.code], headers: { 'Cache-Control': 'no-store' } });
  }
}
