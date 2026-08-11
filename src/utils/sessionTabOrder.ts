/** Return a new session order after dragging one tab onto another tab. */
export function reorderSessionTabs<T extends { id: string }>(
  sessions: T[],
  draggedId: string,
  targetId: string,
): T[] {
  const fromIndex = sessions.findIndex((session) => session.id === draggedId)
  const targetIndex = sessions.findIndex((session) => session.id === targetId)
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return sessions

  const reordered = [...sessions]
  ;[reordered[fromIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[fromIndex]]
  return reordered
}
