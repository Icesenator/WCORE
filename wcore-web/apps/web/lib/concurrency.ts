// Generic concurrency pool — limits parallel async operations.
// Extracted from useScanOrchestrator for reuse.

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  signal?: { aborted: boolean },
): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      if (signal?.aborted) return;
      const item = items[idx++];
      if (item === undefined) return;
      await fn(item);
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}
