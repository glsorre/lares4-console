// Text wrapping and horizontal slice helpers for log-like rendering (tests + future UI use).
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
