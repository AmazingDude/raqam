// Generate a read-only fingerprint check for the SQL-editor import migration.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const migration = (await readFile(new URL('../supabase/migrations/202610100002_csv_imports.sql', import.meta.url), 'utf8')).replaceAll('\r', '');
const functions = [...migration.matchAll(/create function public\.(register_csv_import|confirm_csv_import)[\s\S]*?as \$\$([\s\S]*?)\$\$;/g)];
if (functions.length !== 2) throw new Error('Expected two import functions');
const rows = functions.map(match => `('${match[1]}','${createHash('md5').update(match[2]).digest('hex')}')`).join(',\n');
console.log(`with expected(name,fingerprint) as (values ${rows})
select e.name, coalesce(md5(replace(p.prosrc,chr(13),'')) = e.fingerprint, false) as matches_local_body
from expected e left join pg_catalog.pg_proc p on p.proname=e.name
  and p.pronamespace='public'::regnamespace order by e.name;`);
