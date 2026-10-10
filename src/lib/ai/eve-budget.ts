// Shared by all Eve requests in this Node process, including different users.
// This is an application guard, not an account-wide billing limit across hosts.
export function createEveBudget(now = () => Date.now()) {
  let day = -1, used = 0, busy = false;
  return {
    acquire(setting: string | undefined): (() => void) | null {
      const limit = setting === undefined || setting === '' ? 20 : Number(setting);
      if (!Number.isInteger(limit) || limit < 0 || limit > 20) return null;
      const currentDay = Math.floor(now() / 86_400_000);
      if (currentDay !== day) { day = currentDay; used = 0; }
      if (busy || used >= limit) return null;
      used++; busy = true;
      let released = false;
      return () => { if (!released) { released = true; busy = false; } };
    },
  };
}
export const eveBudget = createEveBudget();
