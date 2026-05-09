export interface ScrollBarState {
  contentHeight: number;
  viewportHeight: number;
  scrollOffset: number;
}

export function normalizeScrollBarState(args: {
  contentHeight: number;
  viewportHeight: number;
  scrollOffset: number;
}): ScrollBarState {
  const contentHeight = Math.max(0, Math.floor(args.contentHeight));
  const viewportHeight = Math.max(1, Math.floor(args.viewportHeight));
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  const scrollOffset = Math.max(0, Math.min(Math.floor(args.scrollOffset), maxOffset));
  return { contentHeight, viewportHeight, scrollOffset };
}

