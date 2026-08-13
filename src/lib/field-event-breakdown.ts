/** Rozbicie listy eventów na boisku per dyscyplina, do chipów na karcie szczegółów. */
export function bucketEventsBySport(events: { sport: string }[]): { sport: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.sport, (counts.get(event.sport) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([sport, count]) => ({ sport, count }))
    .sort((a, b) => b.count - a.count);
}
