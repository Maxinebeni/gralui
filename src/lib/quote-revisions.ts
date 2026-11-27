type QuoteRevision = { id: string; version: number };

export function quoteRevisionKey(quote: QuoteRevision) {
  return `${quote.id}:${quote.version}`;
}

export function latestQuoteRevisions<T extends QuoteRevision>(quotes: T[]): T[] {
  const latest = new Map<string, T>();
  for (const quote of quotes) {
    if (quote.version > (latest.get(quote.id)?.version ?? 0)) latest.set(quote.id, quote);
  }
  return [...latest.values()];
}

export function comparedQuoteReferences(quotes: QuoteRevision[], selected: QuoteRevision, alternatives: string[]) {
  const references = quotes.filter((quote) => quote.id !== selected.id && alternatives.includes(quoteRevisionKey(quote)));
  if (references.length !== alternatives.length) throw new Error("A comparison quote has changed. Review and select the current quotes.");
  return references.map((quote) => ({ quoteId: quote.id, quoteVersion: quote.version }));
}
