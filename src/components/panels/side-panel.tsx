import { Separator } from "@/components/ui/separator";
import { LayerPanel } from "./layer-panel";
import { Legend } from "./legend";
import { RegionPanel } from "./region-panel";

/** Shared contents of the desktop sidebar and the mobile bottom sheet. */
export function SidePanel() {
  return (
    <div className="space-y-4 p-4">
      <RegionPanel />
      <Separator />
      <LayerPanel />
      <Separator />
      <Legend />
    </div>
  );
}
