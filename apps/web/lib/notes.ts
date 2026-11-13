export const noteLimits = { title: 200, text: 50_000, tags: 20, tag: 50 } as const;
export const notesPageSize = 20;

export type NoteDraft = { title: string; noteText: string; tags?: string[] };
export type NotePatch = Partial<NoteDraft>;
export type NoteSummary = { id: string; kind: "note"; title: string; updatedAt: string };
export type SavedNote = NoteSummary & { noteText: string; tags: string[]; sourceRevision: number; createdAt: string };
export type NotesList = { items: NoteSummary[]; page: number; hasMore: boolean };

export function isNoteId(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export function parseNotesPage(value: string | undefined): number | null {
  if (value === undefined) return 1;
  const page = Number(value);
  return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(page * notesPageSize) ? page : null;
}

export function notesHref(page: number, noteId?: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (noteId) params.set("note", noteId);
  return params.size ? `/notes?${params}` : "/notes";
}
