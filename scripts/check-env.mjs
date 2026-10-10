const required = ['APP_URL', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
if (process.argv.includes('--ai')) required.push('GROQ_API_KEY', 'GROQ_VISION_MODEL', 'GROQ_TEXT_MODEL');
const missing = required.filter(name => !process.env[name]?.trim());
const invalid = [];
if (process.env.BYOK_ENCRYPTION_KEY?.trim()) {
  const encoded=process.env.BYOK_ENCRYPTION_KEY.trim(),key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))invalid.push('BYOK_ENCRYPTION_KEY');
}
for (const name of ['APP_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
  if (!process.env[name]) continue;
  try {
    const url = new URL(process.env[name]);
    if (url.username || url.password || (name === 'NEXT_PUBLIC_SUPABASE_URL' && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol)) invalid.push(name);
  } catch { invalid.push(name); }
}
if (missing.length || invalid.length) {
  if (missing.length) console.error(`Missing configuration: ${missing.join(', ')}`);
  if (invalid.length) console.error(`Invalid URL configuration: ${invalid.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Required configuration is present. This does not verify credentials, provider access or isolation.');
}
