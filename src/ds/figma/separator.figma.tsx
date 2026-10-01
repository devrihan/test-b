import figma from "@figma/code-connect";
import { Separator } from "../src/components/ui/separator";

figma.connect(
  Separator,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6906-17585",
  {
    props: {
      orientation: figma.enum("Type", {
        Horizontal: "horizontal",
        Vertical: "vertical",
      }),
    },
    example: ({ orientation }) => <Separator orientation={orientation} />,
  }
);
