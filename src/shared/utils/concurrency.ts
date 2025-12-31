export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) {
    return;
  }

  const safeLimit = Math.max(1, limit);
  const running = new Set<Promise<void>>();

  for (let index = 0; index < items.length; index += 1) {
    const taskPromise = Promise.resolve(worker(items[index], index)).finally(() => {
      running.delete(taskPromise);
    });

    running.add(taskPromise);

    if (running.size >= safeLimit) {
      await Promise.race(running);
    }
  }

  await Promise.allSettled(running);
}
