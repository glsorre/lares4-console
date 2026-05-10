# lares4 console

Per l'Italiano, guarda [README.it.md](./README.it.md)

Standalone debug console for Lares4 panels, built with Ink and powered by `lares4-ts`.

## Usage

### Option 1: Start with env vars (non-interactive)

Set required env vars:

- `LARES4_IP`
- `LARES4_PIN`

Optional:

- `LARES4_SENDER` (default: `lares4 console`)
- `LARES4_WSS` (`false` to use ws, default wss)

Then run:

```bash
npm run dev
```

### Option 2: Start without required env vars (interactive intro dialog)

If `LARES4_IP` or `LARES4_PIN` is missing at boot, the app opens an intro dialog and requires:

- `ip`
- `pin`
- `wss` (on/off)

Values entered in the intro dialog are used only for the current run and are not persisted.

You can navigate with `Tab` / `Shift+Tab` or arrow keys, and press `Enter` to continue.

## Quick example

```bash
LARES4_IP=192.168.1.40 LARES4_PIN=123456 npm run dev
```

