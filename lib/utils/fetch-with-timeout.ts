/** Preserve caller cancellation while bounding network requests to backend services. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const callerSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(15000);
  return fetch(input, {
    ...init,
    signal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
  });
};
