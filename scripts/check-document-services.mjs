// Read-only hosted 006 checks. RPC probes use nonexistent IDs/empty batches and cannot create records.
const env = process.env;
let passed = 0;
let phase = 'test-session readiness';
const report = name => { passed++; console.log(`PASS ${name}`); };
async function request(url, options = {}) {
  const result = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  const data = await result.json().catch(() => null);
  return { status: result.status, data };
}
try {
  if (!env.CLERK_SECRET_KEY?.startsWith('sk_test_') || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error('configuration');
  const clerkHeaders = { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` };
  const users = await request('https://api.clerk.com/v1/users?limit=2', { headers: clerkHeaders });
  if (users.status !== 200 || !Array.isArray(users.data)) throw new Error('sessions');
  let headers;
  for (const user of users.data) {
    const sessions = await request(`https://api.clerk.com/v1/sessions?user_id=${encodeURIComponent(user.id)}&status=active&limit=1`, { headers: clerkHeaders });
    const list = Array.isArray(sessions.data) ? sessions.data : sessions.data?.data;
    if (sessions.status !== 200 || !list?.length || list[0].user_id !== user.id) continue;
    const minted = await request(`https://api.clerk.com/v1/sessions/${encodeURIComponent(list[0].id)}/tokens`, { method: 'POST', headers: { ...clerkHeaders, 'Content-Type': 'application/json' }, body: '{}' });
    if (minted.status !== 200 || typeof minted.data?.jwt !== 'string') continue;
    const candidate = { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${minted.data.jwt}`, 'Content-Type': 'application/json' };
    const workspace = await request(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/workspaces?select=business_name&limit=1`, { headers: candidate });
    if (workspace.status === 200 && workspace.data?.[0]?.business_name === 'Raqam synthetic validation') { headers = candidate; break; }
  }
  if (!headers) throw new Error('synthetic_session');
  for (const table of ['supporting_documents','document_history','document_operations','document_extraction_jobs','ai_proposals','proposal_batches']) {
    phase = `${table} authenticated grant`;
    const result = await request(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, { headers });
    if (result.status !== 200 || !Array.isArray(result.data) || result.data.length !== 0) throw new Error('installed_read');
    report(`006 ${table} authenticated grant`);
  }
  const absent = crypto.randomUUID();
  for (const table of ['sources','supporting_documents']) {
    phase = `${table} negative fixture`;
    const negative = await request(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=id&id=eq.${absent}&limit=1`, { headers });
    if (negative.status !== 200 || !Array.isArray(negative.data) || negative.data.length !== 0) throw new Error('negative_fixture');
  }
  const provenance = { modelVersion: 'synthetic-read-only', promptVersion: 'v1', schemaVersion: 'v1' };
  const probes = [
    ['register_supporting_document', { p_source_id: absent }, 'P0002'],
    ['reserve_document_extraction', { p_document_id: absent, p_request_id: crypto.randomUUID(), p_expected_version: 0, p_provenance: provenance }, 'P0002'],
    ['save_document_extraction', { p_document_id: absent, p_request_id: crypto.randomUUID(), p_expected_version: 0, p_outcome: { status: 'failed', reason: 'provider_timeout' } }, 'P0002'],
    ['review_supporting_document', { p_document_id: absent, p_request_id: crypto.randomUUID(), p_expected_version: 0, p_decision: { action: 'reject' } }, 'P0002'],
    ['register_category_proposals', { p_request_id: crypto.randomUUID(), p_provenance: provenance, p_proposals: [] }, '22023'],
    ['register_match_proposals', { p_request_id: crypto.randomUUID(), p_provenance: provenance, p_proposals: [] }, '22023'],
  ];
  for (const [rpc, body, code] of probes) {
    phase = `${rpc} guard`;
    const result = await request(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${rpc}`, { method: 'POST', headers, body: JSON.stringify(body) });
    // PostgREST maps generic P0 SQLSTATEs to 500; app wrappers map P0002 to safe 404.
    const expectedStatus = code === 'P0002' ? 500 : 400;
    if (result.status !== expectedStatus || result.data?.code !== code) {
      console.log(JSON.stringify({ check: phase, status: result.status, code: typeof result.data?.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(result.data.code) ? result.data.code : null }));
      throw new Error('installed_rpc');
    }
    report(`006 ${rpc} installed; invalid/nonexistent command denied`);
  }
  console.log(`${passed}/12 hosted read/grant/guard checks pass. No records written; this is not managed concurrency or live OCR evidence.`);
} catch {
  console.error(`Hosted 006 checks failed at ${phase}. No secrets, records or raw provider details emitted.`);
  process.exitCode = 1;
}
