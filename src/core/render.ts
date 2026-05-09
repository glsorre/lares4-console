// Not currently used: App.tsx delegates wrapping to Ink's <Text wrap> and horizontal pan to
// state.horizontalOffset handled in cli.tsx. Kept here for a potential non-Ink rendering path.
export function wrapRenderedLine(line: string, width: number): string[] {
  if (width <= 0) {
    return [''];
  }
  if (line.length <= width) {
    return [line];
  }
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += width) {
    chunks.push(line.slice(i, i + width));
  }
  return chunks;
}

export function sliceRenderedLine(line: string, width: number, horizontalOffset: number): string {
  if (width <= 0) {
    return '';
  }
  const start = Math.max(0, Math.min(horizontalOffset, line.length));
  return line.slice(start, start + width);
}
