// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Minimal ambient declaration for the dynamically-imported tauri-plugin-sql
// surface used by this module. The real package ships its own types but we
// avoid hard-importing them so the desktop bundle can fall back gracefully
// when the dependency is not present (web preview / vitest).

declare module '@tauri-apps/plugin-sql' {
  interface DatabaseStatic {
    load(url: string): Promise<{
      execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
      select<T>(query: string, bindValues?: unknown[]): Promise<T>;
    }>;
  }
  const Database: DatabaseStatic;
  export default Database;
}
