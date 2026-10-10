# BA-06 managed import-cap check

The runner is prepared and syntax-checked. A live pass is not recorded yet.

Use a dedicated Clerk login in the Raqam app at `http://localhost:3000/workspace`, with a different test email. Create an empty business workspace named exactly **Raqam cap validation**. No additional Supabase project/dashboard account is needed. Keep that user signed in. The runner selects an existing active development session and refuses other workspace names, existing cash, sources or proposals.

From the repository in PowerShell, verify readiness without writes:

```powershell
$env:CAP_BASE_URL = 'http://localhost:3000'
node --env-file=.env.local scripts/smoke-import-cap.mjs --check-only
```

Once the dedicated workspace is ready, run the full check:

```powershell
node --env-file=.env.local scripts/smoke-import-cap.mjs
```

The expected five groups cover empty-workspace guards; 47 synthetic seeded transactions; two concurrent two-row imports producing one success and one 409 with 49 records; unchanged winning retry and losing rollback; then an explicit row rejection allowing the losing import to reach exactly 50 records. The final outflow is PKR 50.50, computed from validated minor-unit strings. Losing cash, review history and confirmation receipt must roll back; original previews must survive.

This test retains **50 synthetic records** and the original test CSVs in that dedicated workspace. It creates no users, changes no other workspaces, calls no AI and deletes no records. Do not use this workspace for ordinary demo imports afterward: it is intentionally at the prototype cap. If a run fails after writes, do not rerun it against that nonempty workspace; preserve the phase output and diagnose the partial fixture state first. Requests are bounded and database SDK retries are disabled. Tokens, account IDs and record payloads are not printed.
