"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRadarCatalogStatus } from "@/lib/radar/use-radar-catalog";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const { refetch, isFetching } = useRadarCatalogStatus();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isFetching ? "Refreshing radar data" : "Refresh radar data"}
            // Disabled while a request is in flight; cancelRefetch:false also
            // makes a click join the in-flight request rather than duplicate it.
            disabled={isFetching}
            onClick={() => void refetch({ cancelRefetch: false })}
          />
        }
      >
        <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
      </TooltipTrigger>
      <TooltipContent>Refresh radar frame list</TooltipContent>
    </Tooltip>
  );
}
