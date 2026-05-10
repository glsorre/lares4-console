# lares4 console

Console di debug desktop per centrali Lares4, basata su **Tauri** e su `lares4-ts`.

## Prerequisiti

- **Node.js** 22+
- Toolchain **Rust** (per `npm run tauri:build`; vedi [rustup](https://rustup.rs/))

## Installazione

```bash
npm ci
```

## Avvio in sviluppo

Avvia il dev server Vite e la shell Tauri:

```bash
npm run dev
```

IP, PIN, mittente e WSS si impostano dalla finestra dell'app.

## Solo build degli asset web

```bash
npm run build
```

Output in `dist-desktop/`.

## Build installer desktop

Richiede Rust/Cargo:

```bash
npm run tauri:build
```

## Test e lint

```bash
npm run test:ci
```
