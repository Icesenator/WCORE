/**
 * Links a caller's abort signal to a locally created controller.
 *
 * Engines create their own controller per request to enforce a timeout, and used to
 * ignore the caller's signal entirely: once a scan had timed out, its REST and RPC
 * calls kept running to completion. The concurrency slot was already released, so the
 * real number of in-flight scans drifted above the configured limit while the quota
 * kept burning for a result nobody would read.
 *
 * Removing the listener matters as much as adding it: a single scan signal is shared by
 * every call that scan makes, so leaving them attached piles up hundreds of listeners
 * on one signal.
 *
 * Returns the cleanup to run once the request settles.
 */
export function linkAbortSignal(external: AbortSignal | undefined, ctrl: AbortController): () => void {
  if (!external) return () => { /* nothing linked */ };
  if (external.aborted) {
    ctrl.abort();
    return () => { /* nothing linked */ };
  }
  const onAbort = () => ctrl.abort();
  external.addEventListener("abort", onAbort, { once: true });
  return () => external.removeEventListener("abort", onAbort);
}
