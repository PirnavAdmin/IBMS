// Keep portaled menus in the viewport and use the side with available space.
export function dropdownPosition(rect, viewport, preferredHeight = 240) {
  const margin = 8, gap = 4;
  const below = Math.max(0, viewport.height - rect.bottom - gap - margin);
  const above = Math.max(0, rect.top - gap - margin);
  const openAbove = below < preferredHeight && above > below;
  const width = Math.max(0, Math.min(rect.width, viewport.width - margin * 2));
  return {
    top: openAbove ? 'auto' : rect.bottom + gap,
    bottom: openAbove ? viewport.height - rect.top + gap : 'auto',
    left: Math.max(margin, Math.min(rect.left, viewport.width - width - margin)),
    width,
    maxHeight: Math.min(preferredHeight, openAbove ? above : below),
  };
}
