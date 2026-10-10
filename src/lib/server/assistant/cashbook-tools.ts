import { z } from 'zod';
import { assistantToolSchemas, transactionSchema } from '../../contracts/schemas.ts';
import { BackendError } from '../errors.ts';
import { calculateCashSummary, validateCashbook } from '../summary.ts';

type Options = {
  workspaceId: string;
  readSnapshot: () => Promise<unknown>;
  deadlineAt: number;
  signal?: AbortSignal;
};
const snapshotSchema = z.strictObject({
  records: z.array(transactionSchema).max(50),
  unresolvedImportRowCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

// One factory per authenticated request. No process-wide cache or model-supplied scope.
export function createCashbookTools(options: Options) {
  const { workspaceId, readSnapshot, deadlineAt, signal } = options;
  if (!workspaceId || !Number.isFinite(deadlineAt)) {
    throw new BackendError('UNAVAILABLE', 'Cashbook tool scope or deadline is unavailable.');
  }
  const expired = () => new BackendError('UNAVAILABLE', 'The assistant request expired. Please retry.');
  const unverifiable = () => new BackendError('UNAVAILABLE', 'Cashbook tool data could not be verified. Please retry.');
  function assertActive() {
    if (signal?.aborted || Date.now() >= deadlineAt) throw expired();
  }
  async function readWithinBudget() {
    assertActive();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(expired()), Math.min(deadlineAt - Date.now(), 2_147_483_647));
      onAbort = () => reject(expired());
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
    try {
      const read = Promise.resolve().then(async () => {
        // Cancellation can happen after scheduling but before this read starts.
        assertActive();
        try { return await readSnapshot(); }
        catch { throw unverifiable(); }
      });
      const raw = await Promise.race([read, stopped]);
      assertActive();
      const snapshot = snapshotSchema.parse(raw);
      return {
        records: validateCashbook(snapshot.records, workspaceId),
        unresolvedImportRowCount: snapshot.unresolvedImportRowCount,
      };
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw unverifiable();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }
  let snapshot: ReturnType<typeof readWithinBudget> | undefined;
  async function load() {
    assertActive();
    snapshot ??= readWithinBudget();
    const value = await snapshot;
    assertActive();
    return value;
  }
  return {
    async list_transactions(input: unknown) {
      const parsed = assistantToolSchemas.list_transactions.safeParse(input);
      if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide valid bounded transaction filters.');
      const args = parsed.data;
      if (args.cursor !== undefined && !z.uuid().safeParse(args.cursor).success) {
        throw new BackendError('INVALID_INPUT', 'Provide a valid transaction cursor.');
      }
      const { records } = await load();
      const filtered = records.filter(record =>
        (args.dateFrom === undefined || record.date >= args.dateFrom) &&
        (args.dateTo === undefined || record.date <= args.dateTo) &&
        (args.category === undefined || record.category === args.category) &&
        (args.categoryStatus === undefined || record.categoryStatus === args.categoryStatus) &&
        (args.matchStatus === undefined || record.matchStatus === args.matchStatus)
      ).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const cursorIndex = args.cursor === undefined ? -1 : filtered.findIndex(record => record.id === args.cursor);
      if (args.cursor !== undefined && cursorIndex < 0) {
        throw new BackendError('CONFLICT', 'The transaction page changed. Restart the lookup.');
      }
      const remaining = filtered.slice(cursorIndex + 1);
      // Detach returned objects so downstream consumers cannot change the cached summary inputs.
      const items = remaining.slice(0, args.limit).map(record => transactionSchema.parse(record));
      assertActive();
      return { items, nextCursor: remaining.length > args.limit ? items.at(-1)!.id : null };
    },
    async get_cash_summary(input: unknown) {
      const parsed = assistantToolSchemas.get_cash_summary.safeParse(input);
      if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide the valid imported cash summary scope.');
      const { records, unresolvedImportRowCount } = await load();
      const { dateFrom, dateTo } = parsed.data;
      const filtered = records.filter(record => (!dateFrom || record.date >= dateFrom) && (!dateTo || record.date <= dateTo));
      const summary = calculateCashSummary(filtered, workspaceId, unresolvedImportRowCount);
      assertActive();
      return summary;
    },
  };
}
