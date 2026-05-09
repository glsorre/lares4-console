/**
 * XTerm SGR extended mouse / wheel reports: ESC [ < btn ; x ; y M|m
 * Button 64/65 are often wheel up/down; 96/97 appear on some terminals (e.g. shifted).
 */
export function sgrWheelDirectionFromRawChunk(chunk: string): 'up' | 'down' | null {
  if (chunk.includes('[<64;') || chunk.includes('[<96;')) return 'up';
  if (chunk.includes('[<65;') || chunk.includes('[<97;')) return 'down';
  return null;
}

/**
 * Parses possibly fragmented raw stdin data and extracts the latest SGR wheel direction.
 * Returns remaining buffer tail (kept small) so split escape sequences can be completed.
 */
export function consumeSgrWheelFromBuffer(buffer: string): { dir: 'up' | 'down' | null; rest: string } {
  const sgrWheelRe = new RegExp(String.raw`\u001B\[<(64|65|96|97);\d+;\d+[mM]`, 'g');
  let dir: 'up' | 'down' | null = null;
  let lastMatchEnd = -1;
  let match: RegExpExecArray | null;

  while ((match = sgrWheelRe.exec(buffer)) !== null) {
    const btn = match[1];
    if (btn === '64' || btn === '96') dir = 'up';
    if (btn === '65' || btn === '97') dir = 'down';
    lastMatchEnd = sgrWheelRe.lastIndex;
  }

  const tailWindow = 64;
  if (lastMatchEnd >= 0) {
    return {
      dir,
      rest: buffer.slice(Math.max(lastMatchEnd, buffer.length - tailWindow)),
    };
  }
  return {
    dir,
    rest: buffer.slice(-tailWindow),
  };
}
