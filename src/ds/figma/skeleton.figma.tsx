import figma from "@figma/code-connect";
import { Skeleton } from "../src/components/ui/skeleton";

figma.connect(
  Skeleton,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=168-2123",
  {
    variant: { Type: "Details" },
    example: () => (
      <div className="flex items-center space-x-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    ),
  }
);

figma.connect(
  Skeleton,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=168-2123",
  {
    variant: { Type: "Card" },
    example: () => (
      <div className="space-y-3">
        <Skeleton className="h-[125px] w-[250px] rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    ),
  }
);
