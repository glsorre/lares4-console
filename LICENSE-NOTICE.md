# Licensing

This repository contains code under two distinct licenses.

## Default license — ISC

All source files outside the `src/pro/` directory are licensed under the
**ISC License** (see `LICENSE` in the repository root).

## `src/pro/` — PolyForm Noncommercial License 1.0.0

Files within `src/pro/` (including the macro feature in `src/pro/macros/`,
multi-connection tabs in `src/pro/tabs/`, trigger rules in
`src/pro/triggers/`, and pin & bookmarks in `src/pro/annotations/`)
are licensed under the **PolyForm Noncommercial License 1.0.0**
(see the `LICENSE` file inside each `src/pro/<subdir>/`).

In short: those files may be used freely for any noncommercial purpose
(personal use, research, education, charitable organizations, government
institutions, etc.). Commercial use requires a separate commercial
license — contact the copyright holder.

## Why two licenses?

The core console is open source so anyone can run, modify, and build on
it. The macro authoring/recording/playback subsystem is offered free of
charge for noncommercial use, with paid commercial licensing available
to fund continued development.

## Summary by directory

| Path             | License                              |
|------------------|--------------------------------------|
| `src/core/**`    | ISC                                  |
| `src/desktop/**` | ISC                                  |
| `src/infra/**`   | ISC                                  |
| `src/components/**` | ISC                               |
| `src/lib/**`     | ISC                                  |
| `src/pro/**`     | PolyForm Noncommercial License 1.0.0 |
| `tests/**`       | ISC (test files for ISC-licensed code) |

Each `src/pro/<subdir>/` ships its own `LICENSE` file containing the
verbatim PolyForm Noncommercial License 1.0.0 text.
