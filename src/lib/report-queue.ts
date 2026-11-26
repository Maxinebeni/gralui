// The backend limits report requests (/api/v1/reports/...) per user: a short
// burst, then a number per minute. Every report request in the app goes through
// this one queue, one at a time, so screens do not use up the burst together.

let queue: Promise<unknown> = Promise.resolve();

/** Run report requests one after another, in the order they were asked for. */
export function oneReportAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/** How long to wait after a 429 or 503: the server's Retry-After (at most 10 s), else 2 s, plus a little jitter. */
export function retryDelayMs(res: Response): number {
  const after = Number(res.headers.get("Retry-After"));
  return (Number.isFinite(after) && after > 0 ? Math.min(after, 10) : 2) * 1000 + Math.random() * 500;
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
