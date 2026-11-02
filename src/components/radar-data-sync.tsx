"use client";

import { useEffect } from "react";
import { useRadarCatalog } from "@/lib/radar/use-radar-catalog";
import { useAtmosStore } from "@/store/atmos-store";

/**
 * The single polling observer of the radar metadata query. It pushes each new
 * catalog into the store, where the selection is reconciled (follow latest,
 * keep pinned frame, or replace an expired one).
 */
export function RadarDataSync() {
  const { data } = useRadarCatalog();
  useEffect(() => {
    if (data) useAtmosStore.getState().setCatalog(data);
  }, [data]);
  return null;
}
