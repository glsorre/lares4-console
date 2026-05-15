import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

export async function readProfilesFile(): Promise<string | null> {
  return await invoke<string | null>('read_profiles_file');
}

export async function writeProfilesFile(content: string): Promise<void> {
  await invoke('write_profiles_file', { content });
}

export async function quarantineProfilesFile(suffix: string): Promise<string> {
  return await invoke<string>('quarantine_profiles_file', { suffix });
}

export async function readUtf8File(path: string): Promise<string> {
  return await invoke<string>('read_utf8_file', { path });
}

export async function writeUtf8File(path: string, content: string): Promise<void> {
  await invoke('write_utf8_file', { path, content });
}

export async function resolveDefaultSessionPath(prefix: string, ext: string): Promise<string> {
  return await invoke<string>('resolve_default_session_path', { prefix, ext });
}

export interface SaveDialogOptions {
  defaultPath?: string;
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}

export async function showSaveDialog(opts: SaveDialogOptions): Promise<string | null> {
  return await save(opts);
}
