/** Shared motion presets — keep timings aligned with --motion-* tokens in styles.css. */

import type { Transition } from 'motion/react';

export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export const FAST: Transition = { duration: 0.12, ease: EASE_OUT_QUINT };
export const BASE: Transition = { duration: 0.22, ease: EASE_OUT_QUINT };
export const DELIBERATE: Transition = { duration: 0.36, ease: EASE_OUT_QUINT };

export const SHELL_REVEAL = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  transition: BASE,
} as const;

export const ROW_ENTER = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: FAST,
} as const;

export const PANE_CROSSFADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: FAST,
} as const;
