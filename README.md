# lares4 console

Per l'Italiano, guarda [README.it.md](./README.it.md)

Desktop debug console for Lares4 panels, built with **Tauri** and powered by `lares4-ts`.

## Prerequisites

- **Node.js** 22+
- **Rust** toolchain (for `npm run tauri:build`; install via [rustup](https://rustup.rs/))

## Install

```bash
npm ci
```

## Run (development)

Starts the Vite dev server and opens the Tauri shell:

```bash
npm run dev
```

Connection settings (IP, PIN, sender, WSS) and saved profiles are configured in the app window.

## Build frontend assets only

```bash
npm run build
```

Output: `dist-desktop/`.

## Build desktop installers

Requires Rust/Cargo on your machine:

```bash
npm run tauri:build
```

## Test and lint

```bash
npm run test:ci
```
