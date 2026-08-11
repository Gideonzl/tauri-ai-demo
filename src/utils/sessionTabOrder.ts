export function getSessionTabDropPlacement(
  bounds: Pick<DOMRect, 'left' | 'width'>,
  pointerX: number,
): 'before' | 'after' {
  return pointerX < bounds.left + bounds.width / 2 ? 'before' : 'after'
}

/** Return a new session order after dragging one tab onto another tab. */
export function reorderSessionTabs<T extends { id: string }>(
  sessions: T[],
  draggedId: string,
  targetId: string,
  placement: 'before' | 'after' = 'before',
): T[] {
  const fromIndex = sessions.findIndex((session) => session.id === draggedId)
  const targetIndex = sessions.findIndex((session) => session.id === targetId)
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return sessions

  const reordered = [...sessions]
  const [dragged] = reordered.splice(fromIndex, 1)
  const nextTargetIndex = reordered.findIndex((session) => session.id === targetId)
  reordered.splice(placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, dragged)
  return reordered
}
