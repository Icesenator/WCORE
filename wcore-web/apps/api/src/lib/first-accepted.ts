/**
 * Runs the same lookup against several endpoints at once, listed by PRIORITY (index 0 is the
 * most trusted). It settles as soon as the answer is known to be the one a sequential,
 * priority-ordered read would have chosen: the accepted result of the lowest index, once every
 * endpoint with a higher priority has settled without an accepted result. A fast secondary
 * endpoint therefore can never override a slower, higher-priority one (a malicious or buggy
 * secondary RPC cannot win a race), while a fast primary endpoint settles the lookup without
 * waiting for the slowest one. The requests that no longer matter are aborted.
 *
 * If no result is accepted, it waits for every task and returns all settled values so the
 * caller can apply its own fallback. A task that throws counts as `null`.
 */
export async function firstAccepted<T>(
  tasks: Array<(signal: AbortSignal) => Promise<T | null>>,
  accept: (value: T) => boolean,
): Promise<{ accepted: T | null; settled: Array<T | null> }> {
  if (tasks.length === 0) return { accepted: null, settled: [] };
  const outer = new AbortController();
  const settled: Array<T | null> = new Array(tasks.length).fill(null);
  const isSettled: boolean[] = new Array(tasks.length).fill(false);
  return new Promise((resolve) => {
    let done = false;
    const evaluate = () => {
      if (done) return;
      // Walk by priority: the first index that is either still pending (wait) or accepted (answer).
      for (let i = 0; i < tasks.length; i++) {
        if (!isSettled[i]) return;
        const value = settled[i];
        if (value != null && accept(value)) {
          done = true;
          outer.abort();
          resolve({ accepted: value, settled });
          return;
        }
      }
      done = true;
      resolve({ accepted: null, settled });
    };
    tasks.forEach((task, index) => {
      let run: Promise<T | null>;
      try { run = task(outer.signal); } catch { run = Promise.resolve(null); }
      run.catch(() => null).then((value) => {
        settled[index] = value;
        isSettled[index] = true;
        evaluate();
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
