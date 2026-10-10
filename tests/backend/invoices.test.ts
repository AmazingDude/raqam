import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { invoiceLineAmount,invoiceTotals } from '../../src/lib/invoice-money.ts';
import { generateInvoiceDraft,invoiceModelSchema } from '../../src/lib/server/invoice-ai.ts';
import { createAIProvider } from '../../src/lib/ai/factory.ts';
import { computeInvoicesSummary } from '../../src/lib/server/invoices.ts';
import type { Invoice } from '../../src/lib/contracts/invoices.ts';
const env=()=>({AI_PROVIDER:'groq',GROQ_API_KEY:'synthetic-test-key',GROQ_TEXT_MODEL:'openai/gpt-oss-20b',GROQ_VISION_MODEL:'qwen/qwen3.8-27b'});
function modelOutput(changes:Record<string,unknown>={}) { const shape=invoiceModelSchema.shape.changes.shape;return {changes:{...Object.fromEntries(Object.keys(shape).map(key=>[key,null])),...changes},assistantMessage:'Unsaved invoice proposal. Review before saving.',missingFields:[]}; }
function completion(output:unknown) {return Response.json({id:'synthetic-completion',object:'chat.completion',created:1,model:'openai/gpt-oss-20b',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});}
function assertStrict(value:unknown):void {
  if(!value||typeof value!=='object')return;const schema=value as Record<string,unknown>;
  if (schema.anyOf) assert.ok(!(schema.anyOf as Record<string,unknown>[]).some(variant => variant.anyOf), 'Nullable unions must be flat for the provider');
  if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual([...(schema.required as string[])].sort(),Object.keys(schema.properties as object).sort());}
  for(const child of Object.values(schema))if(Array.isArray(child))child.forEach(assertStrict);else if(typeof child==='object')assertStrict(child);
  if(schema.properties)Object.values(schema.properties).forEach(assertStrict);
}
test('invoice arithmetic is exact, rounds line half up and rejects precision, overflow and excessive discounts',()=>{
  assert.equal(invoiceLineAmount(0.5,'101'),'51');assert.equal(invoiceLineAmount(1,'9007199254740993'),'9007199254740993');
  assert.deepEqual(invoiceTotals([{quantity:0.5,rateMinor:'101'},{quantity:0.5,rateMinor:'101'}]),{amounts:['51','51'],subtotalMinor:'102',totalMinor:'102'});
  for(const quantity of [NaN,-1,1.001,100001])assert.throws(()=>invoiceLineAmount(quantity,'100'));
  assert.throws(()=>invoiceLineAmount(100000,'9223372036854775807'));assert.throws(()=>invoiceTotals([{quantity:1,rateMinor:'100'}],'101'));
});
test('invoice AI uses a strict required nullable schema, one request, verified totals and no model-owned approval',async()=>{
  let calls=0,released=0;
  const provider=createAIProvider({environment:env,fetch:async(_url,init)=>{
    calls++;const body=JSON.parse(String(init!.body));assert.equal(body.response_format.json_schema.strict,true);assertStrict(body.response_format.json_schema.schema);
    assert.equal(body.model,'openai/gpt-oss-20b');
    return completion(modelOutput({clientName:'Synthetic Client',items:[{description:'Synthetic Service',quantity:0.5,rateMinor:'101'}]}));
  }});
  const result=await generateInvoiceDraft({prompt:'Synthetic Client, half a unit of Synthetic Service at PKR 1.01.'},'PKR',new AbortController().signal,{provider,acquire:()=>()=>{released++;}});
  assert.equal(result.draft.items![0]!.amountMinor,'51');assert.equal(result.draft.totalMinor,'51');assert.equal(result.draft.status,undefined);assert.equal(result.draft.workspaceId,undefined);assert.equal(calls,1);assert.equal(released,1);
  assertStrict(z.toJSONSchema(invoiceModelSchema,{io:'input'}));
});
test('missing rates remain missing; dates/terms are not converted to zero or invented line items',async()=>{
  const provider=createAIProvider({environment:env,fetch:async()=>completion({...modelOutput(),missingFields:['line rate']})});
  const result=await generateInvoiceDraft({prompt:'Invoice due in 30 days, amount unknown.'},'PKR',new AbortController().signal,{provider,acquire:()=>()=>{}});
  assert.equal(result.draft.items,undefined);assert.equal(result.draft.totalMinor,undefined);assert.deepEqual(result.missingFields,['line rate']);
});
test('AI rejects forged ownership/status, invalid amounts and wrong currencies without retries',async()=>{
  for(const changes of [{status:'paid'},{workspaceId:'foreign'},{items:[{description:'Synthetic',quantity:1,rateMinor:'unknown'}]},{currency:'USD'}]){
    let calls=0;const provider=createAIProvider({environment:env,fetch:async()=>{calls++;return completion(modelOutput(changes));}});
    await assert.rejects(()=>generateInvoiceDraft({prompt:'Synthetic invoice'},'PKR',new AbortController().signal,{provider,acquire:()=>()=>{}}));assert.equal(calls,1);
  }
});
test('AI bounds cancellation and daily allowance and explains configuration failure',async()=>{
  const provider=createAIProvider({environment:()=>({}),fetch:async()=>{throw new Error('must not call');}});
  await assert.rejects(()=>generateInvoiceDraft({prompt:'Synthetic'},'PKR',new AbortController().signal,{provider,acquire:()=>null}),/allowance/);
  const abort=new AbortController();abort.abort();await assert.rejects(()=>generateInvoiceDraft({prompt:'Synthetic'},'PKR',abort.signal,{provider}),error=>error instanceof Error&&error.name==='AbortError');
  await assert.rejects(()=>generateInvoiceDraft({prompt:'Synthetic'},'PKR',new AbortController().signal,{provider,acquire:()=>()=>{}}),/Groq or Gemini/);
});
test('invoice summaries separate currencies and show actual period data without treating status as bank cash',()=>{
  const base={status:'paid',currency:'PKR',totalMinor:'9007199254740993',issueDate:'2026-10-10',dueDate:'2026-10-24'};
  const summary=computeInvoicesSummary([base,{...base,currency:'USD'},{...base,issueDate:'2026-09-10'},{...base,status:'sent',totalMinor:'100',dueDate:'2026-10-09'}] as Invoice[],'PKR',new Date('2026-10-10T12:00:00Z'));
  assert.equal(summary.paidMinor,'18014398509481986');assert.equal(summary.cashflow[9]!.amountMinor,'9007199254740993');assert.equal(summary.overdueMinor,'100');assert.equal(summary.overdueDueNowCount,1);
});
