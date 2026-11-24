/** A tiny concurrency limiter: at most `limit` tasks run at the same time. */
export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createLimiter(limit: number): Limiter {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`concurrency must be an integer >= 1 (got ${limit})`);
  }
  let active = 0;
  const waiting: Array<() => void> = [];

  const release = (): void => {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      active += 1;
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
