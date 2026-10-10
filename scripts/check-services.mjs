// Read-only readiness probe. Never prints keys, tokens, records or raw vendor errors.
const env = process.env;
let failed = false;
async function check(name, url, headers, expectedStatuses, expectedCode = null) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const payload = await response.json().catch(() => null);
    const code = typeof payload?.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(payload.code) ? payload.code : null;
    const passed = expectedStatuses.includes(response.status) && (expectedCode === null || code === expectedCode);
    failed ||= !passed;
    console.log(JSON.stringify({ check: name, passed, httpStatus: response.status, code }));
  } catch {
    failed = true;
    console.log(JSON.stringify({ check: name, passed: false, reason: 'Connection failed or timed out' }));
  }
}
if (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error('Required server configuration is missing. Run npm run check:env.');
  process.exitCode = 1;
} else {
  await check('Clerk server credential', 'https://api.clerk.com/v1/users?limit=1', {
    Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
  }, [200]);
  await check('Supabase publishable key', new URL('/auth/v1/settings', env.NEXT_PUBLIC_SUPABASE_URL),
    { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, [200]);
  const tables = ['workspaces', 'sources', 'cashbook_records', 'imports', 'review_decisions'];
  if (process.argv.includes('--reviews')) tables.push('transaction_reviews');
  for (const table of tables) {
    await check(`Supabase ${table}: schema present and anonymous access denied`,
      new URL(`/rest/v1/${table}?select=*&limit=0`, env.NEXT_PUBLIC_SUPABASE_URL),
      { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, [401, 403], '42501');
  }
  console.log('This probe does not verify Clerk/Supabase token integration or two-user row/file isolation.');
  process.exitCode = failed ? 1 : 0;
}
