// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.
//
// Reads / writes a single `scratchpad.js` file under the Tauri app-data
// directory. Users can edit the file in their own editor; the REPL pane
// provides Load / Save buttons.

import { appDataDir, join } from '@tauri-apps/api/path';
import { readUtf8File, writeUtf8File } from '@/desktop/runtime/tauri-fs.js';

const SCRATCHPAD_FILENAME = 'scratchpad.js';

async function scratchpadPath(): Promise<string> {
  const dir = await appDataDir();
  return await join(dir, SCRATCHPAD_FILENAME);
}

/** Read the scratchpad. Returns `''` when the file does not exist. */
export async function loadScratchpad(): Promise<string> {
  try {
    return await readUtf8File(await scratchpadPath());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such file|not found|os error 2/i.test(msg)) return '';
    throw err;
  }
}

export async function saveScratchpad(content: string): Promise<string> {
  const target = await scratchpadPath();
  await writeUtf8File(target, content);
  return target;
}

export async function getScratchpadPath(): Promise<string> {
  return await scratchpadPath();
}
