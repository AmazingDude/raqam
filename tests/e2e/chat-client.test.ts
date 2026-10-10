import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../src/lib/client/api.ts';
const id='10000000-0000-4000-8000-000000000001',conversation='10000000-0000-4000-8000-000000000002',messageId='10000000-0000-4000-8000-000000000003';
const message={id:messageId,conversationId:conversation,role:'assistant',text:'Please give a full date.',createdAt:'2026-10-10T10:00:00Z',plan:null,state:'message',result:null};
test('chat client scopes paginated reads and preserves retry IDs and explicit decisions',async t=>{
 const signal=new AbortController().signal,calls:{path:string;init:RequestInit}[]=[];let data:unknown={workspaceId:id,conversations:[],conversation:null,messages:[],nextCursor:null};
 t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{calls.push({path:String(path),init});return Response.json({data,error:null});});
 await api.chatHistory(signal,conversation,messageId);assert.ok(calls[0]!.path.includes(`conversationId=${conversation}`));assert.ok(calls[0]!.path.includes(`cursor=${messageId}`));
 data={workspaceId:id,conversationId:conversation,message};
 const input={conversationId:conversation,requestId:id,message:'I paid rent.'};await api.chatSend(input,signal);await api.chatSend(input,signal);assert.equal(calls[1]!.init.body,calls[2]!.init.body);
 data={workspaceId:id,message:{...message,state:'applied',plan:{actions:[{kind:'create_cash',values:{date:'2026-09-01',description:'Rent',direction:'out',amountMinor:'3000000',reference:null,category:null},counterAccountId:null,counterAccountName:null}]},result:{transactionIds:[id]}},duplicate:false};
 await api.chatDecide({messageId,decision:'apply'},signal);assert.deepEqual(JSON.parse(calls[3]!.init.body as string),{messageId,decision:'apply'});
 assert.ok(calls.every(c=>c.init.signal===signal&&c.init.cache==='no-store'&&c.init.credentials==='same-origin'));
 assert.throws(()=>api.chatDecide({messageId,decision:'anything' as 'apply'},signal));
});
