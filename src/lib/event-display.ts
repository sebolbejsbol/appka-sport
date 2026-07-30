/** Krótki podgląd tytułu / notatki na listach i w sheet boiska. */
export const EVENT_LIST_TITLE_PREVIEW_CHARS = 36;
export const EVENT_LIST_NOTES_PREVIEW_CHARS = 56;

export function previewEventText(
  value: string | null | undefined,
  maxChars: number,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

export function previewEventTitle(value: string | null | undefined): string | null {
  return previewEventText(value, EVENT_LIST_TITLE_PREVIEW_CHARS);
}

export function previewEventNotes(value: string | null | undefined): string | null {
  return previewEventText(value, EVENT_LIST_NOTES_PREVIEW_CHARS);
}

export function isEventTextTruncated(
  value: string | null | undefined,
  maxChars: number,
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return trimmed.length > maxChars;
}
