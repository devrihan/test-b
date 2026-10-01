import figma from "@figma/code-connect";
import { AspectRatio } from "../src/components/ui/aspect-ratio";

figma.connect(
  AspectRatio,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6908-6543",
  {
    example: () => (
      <AspectRatio ratio={16 / 9}>
        <img src="/placeholder.png" alt="" className="h-full w-full object-cover" />
      </AspectRatio>
    ),
  }
);
