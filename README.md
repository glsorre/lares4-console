# lares4-debug-console

Standalone debug console for Lares panels, built with Ink and powered by `lares4-ts`.

## Goals

- Separate project/repository lifecycle from `lares4-ts`
- Better TUI UX with maintained library stack
- Keep command compatibility with existing debug console workflow

## Usage

Set required env vars:

- `LARES4_IP`
- `LARES4_PIN`

Optional:

- `LARES4_SENDER` (default: `lares4-debug-console`)
- `LARES4_WSS` (`false` to use ws, default wss)

Then run:

```bash
npm run dev
```
