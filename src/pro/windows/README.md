# Multi-window (Pro)

The code in this directory implements multi-window support for the
Lares4 console — additional native windows can be opened from the app
header. Each window boots its own React tree and owns an independent
`SessionController`, so two windows can connect to two different
Lares4 panels at once. The on-disk profiles repository is shared across
windows (last-write-wins).

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

- `types.ts` — `WindowMeta`, `WindowsSnapshot`, `MAX_FREE_WINDOWS`
- `controller.ts` — `WindowsController` class + `WindowsAdapter` interface
- `adapter-tauri.ts` — production adapter wrapping the Tauri window APIs (no-op outside the desktop build)
- `context.tsx` — `WindowsProvider`, `useWindows`, `useIsMainWindow`
- `ui/NewWindowButton.tsx` — header button (locked + upsell when unlicensed)

Imported via the `@pro/windows` path alias.
