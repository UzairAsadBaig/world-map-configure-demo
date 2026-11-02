"use client";

import { useQuery } from "@tanstack/react-query";
import { HttpError, providerBudget, retryDelayMs } from "@/lib/net/request-budget";
import { activeProvider } from "./provider";
import type { RadarCatalog } from "./types";

export const REFRESH_INTERVAL_MS = 5 * 60_000;

export async function fetchCatalog(signal: AbortSignal): Promise<RadarCatalog> {
  const url = activeProvider.metadataUrl;
  // Metadata is not cacheable (Cache-Control: no-cache); count every request.
  providerBudget.record(`${url}#${Date.now()}`);
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new HttpError(
      res.status,
      res.status === 429
        ? "The radar provider is rate-limiting requests (HTTP 429)."
        : `Radar metadata request failed (HTTP ${res.status}).`,
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("Radar metadata was not valid JSON.");
  }
  try {
    return activeProvider.parseCatalog(json);
  } catch {
    throw new Error("Radar metadata did not match the documented format.");
  }
}

/**
 * Radar metadata via TanStack Query: refreshed roughly every five minutes,
 * de-duplicated (one in-flight request at a time), retried with backoff.
 * Tile requests are deliberately *not* here; MapLibre owns those.
 */
export function useRadarCatalog() {
  return useQuery({
    queryKey: ["radar-catalog", activeProvider.id],
    queryFn: ({ signal }) => fetchCatalog(signal),
    refetchInterval: REFRESH_INTERVAL_MS,
    // Hidden tabs do not poll; focus/visibility triggers a refresh if stale.
    refetchIntervalInBackground: false,
    staleTime: REFRESH_INTERVAL_MS - 30_000,
    retry: (count, error) => count < 4 && !(error instanceof HttpError && error.status === 404),
    retryDelay: (attempt, error) => retryDelayMs(attempt, error),
    // On refetch errors TanStack keeps the last good `data`, so the map keeps
    // working and the UI reports the data as stale instead of blanking it.
  });
}

/**
 * Read-only view of the same query for status displays and the manual refresh
 * button. `enabled: false` means this observer never fetches or polls on its
 * own, so only `RadarDataSync` drives the five-minute interval. `refetch()`
 * still works for manual refreshes and joins any request already in flight.
 */
export function useRadarCatalogStatus() {
  return useQuery({
    queryKey: ["radar-catalog", activeProvider.id],
    queryFn: ({ signal }) => fetchCatalog(signal),
    enabled: false,
    retry: (count, error) => count < 4 && !(error instanceof HttpError && error.status === 404),
    retryDelay: (attempt, error) => retryDelayMs(attempt, error),
  });
}
