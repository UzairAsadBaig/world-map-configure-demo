"use client";

import { useSyncExternalStore } from "react";

const STEP_MS = 30_000;

function subscribe(cb: () => void) {
  const id = window.setInterval(cb, STEP_MS);
  return () => window.clearInterval(id);
}

/**
 * Coarse wall clock (Unix seconds, 30 s resolution) for "x min ago" labels.
 * Returns 0 during server rendering and hydration so markup matches.
 */
export function useNowSeconds(): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / STEP_MS) * (STEP_MS / 1000),
    () => 0,
  );
}
