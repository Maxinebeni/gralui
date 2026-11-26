/**
 * After a form fails its checks, move focus to the first field with an error,
 * so keyboard and screen-reader users land on it. Fields are matched by an id
 * or name that ends with the error's key (forms prefix their ids).
 */
export function focusFirstError(form: HTMLFormElement | null | undefined, keys: string[], ids: Record<string, string> = {}) {
  if (!form || keys.length === 0) return;
  // A form can name the field each error belongs to when its ids do not end with the key.
  const wanted = keys.filter(Boolean).map((k) => ids[k] ?? k);
  // Wait a tick so the error messages are on screen first.
  setTimeout(() => {
    for (const el of Array.from(form.elements)) {
      const field = el as HTMLElement & { name?: string };
      const id = field.id ?? "";
      const name = field.name ?? "";
      if (wanted.some((k) => id === k || id.endsWith(`-${k}`) || id.toLowerCase().endsWith(k.toLowerCase()) || name === k)) {
        field.focus();
        return;
      }
    }
  }, 0);
}
