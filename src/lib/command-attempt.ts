/** One mounted form's command and confirmed uploads. Nothing is persisted. */
export class CommandAttempt {
  private values = new Map<string, unknown>();
  uncertain = false;

  value<T>(key: string, create: () => T): T {
    if (!this.values.has(key)) this.values.set(key, create());
    return this.values.get(key) as T;
  }

  async memo<T>(key: string, create: () => Promise<T>): Promise<T> {
    if (this.values.has(key)) return this.values.get(key) as T;
    const result = await create();
    this.values.set(key, result);
    return result;
  }

  clear() {
    this.values.clear();
    this.uncertain = false;
  }
}

export class OnboardingError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = "OnboardingError";
  }
}

/** Read all pages before exposing a list as complete. */
export async function collectPages<T>(read: (page: number) => Promise<{ items: T[]; totalElements: number }>): Promise<T[]> {
  const items: T[] = [];
  let total: number | undefined;
  for (let page = 0; ; page++) {
    const result = await read(page);
    if (total !== undefined && total !== result.totalElements) throw new Error("The list changed while loading. Refresh to load the complete list.");
    total = result.totalElements;
    if (!result.items.length && items.length < result.totalElements) throw new Error("The list changed while loading. Refresh to load the complete list.");
    items.push(...result.items);
    if (items.length >= result.totalElements) return items;
  }
}
