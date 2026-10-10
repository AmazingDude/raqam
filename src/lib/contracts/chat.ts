import { z } from 'zod';
import { categorySchema, dateSchema, minorUnitsSchema, transactionSchema } from './schemas.ts';
import { ledgerJournalDraftSchema } from './ledger.ts';
const cashFields={date:dateSchema,description:z.string().trim().min(1).max(500),direction:z.enum(['in','out']),amountMinor:minorUnitsSchema,reference:z.string().max(500).nullable(),category:categorySchema.nullable()};
export const chatCashSchema=z.strictObject(cashFields);
export const chatActionSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('create_cash'),values:chatCashSchema,counterAccountId:z.uuid().nullable(),counterAccountName:z.string().max(120).nullable()}),
 z.strictObject({kind:z.literal('edit_cash'),transactionId:z.uuid(),expectedVersion:z.number().int().min(0),before:transactionSchema,values:chatCashSchema,counterAccountId:z.uuid().nullable(),counterAccountName:z.string().max(120).nullable()}),
 z.strictObject({kind:z.literal('post_journal'),journal:ledgerJournalDraftSchema,accountLabels:z.record(z.string(),z.string().max(120))}),
]);
export const chatPlanSchema=z.strictObject({originalText:z.string().min(1).max(12000).optional(),actions:z.array(chatActionSchema).min(1).max(10)}).superRefine((plan,ctx)=>{
 const ids=plan.actions.filter(a=>a.kind==='edit_cash').map(a=>a.transactionId);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'A record may be edited only once per batch'});
});
export const chatConversationSchema=z.strictObject({id:z.uuid(),workspaceId:z.uuid(),title:z.string().max(100),createdAt:z.string()});
export const chatMessageSchema=z.strictObject({id:z.uuid(),conversationId:z.uuid(),role:z.enum(['user','assistant']),text:z.string().max(12000),createdAt:z.string(),plan:chatPlanSchema.nullable(),state:z.enum(['message','pending','applied','discarded']),result:z.unknown().nullable()});
export const chatHistorySchema=z.strictObject({workspaceId:z.uuid(),conversations:z.array(chatConversationSchema).max(50),conversation:chatConversationSchema.nullable(),messages:z.array(chatMessageSchema).max(50),nextCursor:z.string().nullable()});
export const chatSendSchema=z.strictObject({conversationId:z.uuid().nullable(),requestId:z.uuid(),message:z.string().trim().min(1).max(6000)});
export const chatSendResultSchema=z.strictObject({workspaceId:z.uuid(),conversationId:z.uuid(),message:chatMessageSchema});
export const chatDecisionSchema=z.strictObject({messageId:z.uuid(),decision:z.enum(['apply','discard'])});
export const chatApplyResultSchema=z.strictObject({workspaceId:z.uuid(),message:chatMessageSchema,duplicate:z.boolean()});
export type ChatAction=z.infer<typeof chatActionSchema>;
export type ChatPlan=z.infer<typeof chatPlanSchema>;
export type ChatMessage=z.infer<typeof chatMessageSchema>;
export type ChatHistory=z.infer<typeof chatHistorySchema>;
// Model output is draft data. IDs, review versions, exact paisa and journals
// are rebuilt and validated against the authenticated workspace by the server.
const modelCash=z.strictObject({date:z.string().nullable(),description:z.string().max(500).nullable(),direction:z.enum(['in','out']).nullable(),amount:z.string().max(40).nullable(),reference:z.string().max(500).nullable(),category:categorySchema.nullable(),counterAccountId:z.string().nullable(),clearCategory:z.boolean(),clearReference:z.boolean()});
export const chatDraftSchema=z.strictObject({kind:z.enum(['question','clarify','changes']),text:z.string().max(2000),actions:z.array(z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('create_cash'),values:modelCash}),
 z.strictObject({kind:z.literal('edit_cash'),transactionId:z.string(),values:modelCash}),
 z.strictObject({kind:z.literal('journal'),entryDate:z.string(),description:z.string().max(500),reversalOfId:z.string().nullable(),lines:z.array(z.strictObject({accountId:z.string(),debit:z.string(),credit:z.string()})).min(2).max(10)}),
])).max(10)});

// Provider wire shape uses nullable fields instead of object unions, so all
// configured providers can express it. Decode to the stricter domain union.
export const chatDraftWireSchema=z.strictObject({kind:z.enum(['question','clarify','changes']),text:z.string().max(2000),actions:z.array(z.strictObject({
 kind:z.enum(['create_cash','edit_cash','journal']),transactionId:z.string().nullable(),values:modelCash.nullable(),entryDate:z.string().nullable(),description:z.string().max(500).nullable(),reversalOfId:z.string().nullable(),lines:z.array(z.strictObject({accountId:z.string(),debit:z.string(),credit:z.string()})).max(10),
})).max(10)});
export function parseChatDraft(input:unknown){const wire=chatDraftWireSchema.parse(input);return chatDraftSchema.parse({...wire,actions:wire.actions.map(a=>a.kind==='journal'?{kind:a.kind,entryDate:a.entryDate,description:a.description,reversalOfId:a.reversalOfId,lines:a.lines}:a.kind==='edit_cash'?{kind:a.kind,transactionId:a.transactionId,values:a.values}:{kind:a.kind,values:a.values})});}
