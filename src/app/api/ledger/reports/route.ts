import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../../lib/server/http.ts';
import { BackendError } from '../../../../lib/server/errors.ts';
import { ledgerReportRequestSchema } from '../../../../lib/contracts/ledger.ts';
import { calculateLedgerBalanceSheet, calculateLedgerCashFlow, calculateLedgerIncomeStatement, calculateLedgerTrialBalance } from '../../../../lib/server/ledger/calculations.ts';
import { readCashMovements, readLedger } from '../../../../lib/server/ledger/persistence.ts';

export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 return jsonEndpoint(async()=>{
  const session=await requireSession();const workspace=await requireWorkspace(session);
  const params=Object.fromEntries(new URL(request.url).searchParams);const parsed=ledgerReportRequestSchema.safeParse(params);
  if(!parsed.success)throw new BackendError('INVALID_INPUT','Select a supported report and valid date or period.');
  const snapshot=await readLedger(session,workspace);const input={workspaceId:workspace.id,...snapshot};
  switch(parsed.data.kind){
   case 'trial_balance':return calculateLedgerTrialBalance({...input,asOf:parsed.data.asOf});
   case 'balance_sheet':return calculateLedgerBalanceSheet({...input,asOf:parsed.data.asOf});
   case 'income_statement':return calculateLedgerIncomeStatement({...input,from:parsed.data.from,to:parsed.data.to});
   case 'cash_flow':return calculateLedgerCashFlow({...input,from:parsed.data.from,to:parsed.data.to,movements:await readCashMovements(session,workspace,parsed.data.from,parsed.data.to)});
  }
 });
}
