'use client';
import { useCallback, useEffect, useRef } from 'react';

// Every private screen is unmounted on an identity change. Requests and late results
// are tied to that screen's lifetime, including commands that finish after a close.
export function usePrivateRequests() {
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => () => {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
  }, []);
  return useCallback(async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const result = await work(controller.signal);
      controller.signal.throwIfAborted();
      return result;
    } finally { controllers.current.delete(controller); }
  }, []);
}
