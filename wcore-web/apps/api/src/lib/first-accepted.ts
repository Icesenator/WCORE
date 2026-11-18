/**
 * Runs the same lookup against several endpoints at once and settles as soon as ONE
 * result is accepted, instead of waiting for the slowest endpoint (a transaction
 * receipt is final once any RPC returns it). The remaining requests are aborted.
 *
 * If no result is accepted, it waits for every task and returns all settled values so
 * the caller can apply its own fallback. A task that throws counts as `null`.
 */
export async function firstAccepted<T>(
  tasks: Array<(signal: AbortSignal) => Promise<T | null>>,
  accept: (value: T) => boolean,
): Promise<{ accepted: T | null; settled: Array<T | null> }> {
  if (tasks.length === 0) return { accepted: null, settled: [] };
  const outer = new AbortController();
  const settled: Array<T | null> = new Array(tasks.length).fill(null);
  return new Promise((resolve) => {
    let pending = tasks.length;
    let done = false;
    tasks.forEach((task, index) => {
      let run: Promise<T | null>;
      try { run = task(outer.signal); } catch { run = Promise.resolve(null); }
      run.catch(() => null).then((value) => {
        settled[index] = value;
        pending -= 1;
        if (done) return;
        if (value != null && accept(value)) {
          done = true;
          outer.abort();
          resolve({ accepted: value, settled });
        } else if (pending === 0) {
          done = true;
          resolve({ accepted: null, settled });
        }
      });
    });
  });
}

/** A signal that aborts after `ms` or as soon as `outer` aborts, whichever comes first. */
export function signalWithTimeout(outer: AbortSignal, ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (outer.aborted) ctrl.abort();
  else outer.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ctrl.signal,
    clear: () => { clearTimeout(timer); outer.removeEventListener("abort", onAbort); },
  };
}
