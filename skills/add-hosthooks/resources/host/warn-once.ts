const warned = new Set<string>();

/** Shared fail-loud helper. One implementation, copied into host and runner. */
export function warnOnce(key: string, message: string, error?: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (error === undefined) console.warn(`[nanoclaw-hosthooks] ${message}`);
  else console.warn(`[nanoclaw-hosthooks] ${message}`, error);
}

export function resetWarnOnceForTests(): void {
  warned.clear();
}
