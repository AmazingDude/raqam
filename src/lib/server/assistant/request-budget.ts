import { BackendError } from '../errors.ts';

// A bounded per-instance guard. It holds no record data or provider credentials.
export function createAssistantRequestBudget(now = () => Date.now()) {
  const owners = new Map<string, { startedAt: number; count: number; active: boolean }>();
  return (subject: string) => {
    const time = now();
    for (const [key, entry] of owners) if (!entry.active && time - entry.startedAt >= 60_000) owners.delete(key);
    let entry = owners.get(subject);
    if (entry?.active || (entry && entry.count >= 6)) throw new BackendError('UNAVAILABLE', 'Please wait before asking another question.');
    if (!entry) {
      if (owners.size >= 1000) throw new BackendError('UNAVAILABLE', 'The assistant is busy. Please retry shortly.');
      entry = { startedAt: time, count: 0, active: false }; owners.set(subject, entry);
    }
    entry.count++; entry.active = true;
    return () => { entry.active = false; };
  };
}
export const acquireAssistantRequest = createAssistantRequestBudget();
