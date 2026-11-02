"use client";

import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAtmosStore } from "@/store/atmos-store";
import { SidePanel } from "./side-panel";

/** Below the md breakpoint the sidebar becomes a bottom sheet behind this button. */
export function MobilePanelTrigger() {
  const open = useAtmosStore((s) => s.mobilePanelOpen);
  const setOpen = useAtmosStore((s) => s.setMobilePanelOpen);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 md:hidden"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Layers className="size-4" aria-hidden />
        Layers
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[75dvh] gap-0 overflow-y-auto rounded-t-xl p-0 md:hidden">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Layers &amp; regions</SheetTitle>
            <SheetDescription className="sr-only">
              Choose a region, toggle map layers and read the radar legend.
            </SheetDescription>
          </SheetHeader>
          <SidePanel />
        </SheetContent>
      </Sheet>
    </>
  );
}
