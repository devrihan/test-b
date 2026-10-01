import figma from "@figma/code-connect";
import { ScrollArea, ScrollBar } from "../src/components/ui/scroll-area";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-186034";

figma.connect(ScrollArea, FIGMA_URL, {
  variant: { Orientation: "Vertical" },
  example: () => (
    <ScrollArea className="h-50 w-64 rounded-md border">
      <div className="p-3">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="py-1 text-sm">
            Item {String(i + 1).padStart(2, "0")}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
});

figma.connect(ScrollArea, FIGMA_URL, {
  variant: { Orientation: "Horizontal" },
  example: () => (
    <ScrollArea className="h-30 w-90 rounded-md border">
      <div className="flex gap-2 p-3">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="inline-flex rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium"
          >
            Tag {i + 1}
          </span>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
});

figma.connect(ScrollArea, FIGMA_URL, {
  variant: { Orientation: "Both" },
  example: () => (
    <ScrollArea className="h-50 w-80 rounded-md border">
      <div className="grid w-160 gap-2 p-3">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="py-1 text-sm">
            Item {String(i + 1).padStart(2, "0")}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
});
