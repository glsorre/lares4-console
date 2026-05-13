# Triggers (Pro)

The code in this directory implements trigger rules — pattern-match log
entries and fire actions (highlight, beep, notify, pause stream) for the
Lares4 console.

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

- `types.ts` — `TriggerRule`, `TriggerAction`, `TriggerActionKind`, `TriggerEvaluation`, `HighlightColor`
- `engine.ts` — `evaluateTriggers`, `validateTriggerMatch`
- `ui/TriggersDialog.tsx` — shadcn dialog for creating and editing rules

Imported via the `@pro/triggers` path alias.
