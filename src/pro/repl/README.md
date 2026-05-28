# Script console (Pro)

The code in this directory implements the JavaScript REPL for the Lares4
console. Scripts run in a Web Worker with direct access to the active
`lares4-ts` client, plus `sleep`, `print`, `waitFor`, and an
`AbortSignal` tied to the Stop button.

## License

This directory is licensed under the **PolyForm Noncommercial License
1.0.0** — see `LICENSE` in this directory for the full terms, or
<https://polyformproject.org/licenses/noncommercial/1.0.0>.

Noncommercial use (personal, research, education, charity, government,
etc.) is permitted free of charge. **Commercial use requires a separate
commercial license** — contact the copyright holder.

The rest of the repository is licensed under the ISC License; see
`LICENSE` and `LICENSE-NOTICE.md` at the repository root.

## Public API

- `types.ts` — `ReplEntry`, `Snippet`, RPC message shapes
- `eval-host.ts` — `ReplEvalHost` main-thread bridge (Comlink + log subscription)
- `worker.ts` — Worker entrypoint (eval surface)
- `snippets-db.ts` — `loadSnippetsAdapter`, `SnippetsAdapter` (SQLite-backed)
- `scratchpad.ts` — `loadScratchpad`, `saveScratchpad`
- `ui/ReplPane.tsx` — Script tab component

Imported via the `@pro/repl` path alias.

## Read-only mode

The REPL bypasses the app's read-only guard intentionally: opening the
Script tab and typing `await client.send(...)` is an explicit expert-mode
action. The tab badges this state so the bypass is visible.
