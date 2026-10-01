import figma from "@figma/code-connect";
import { Toaster } from "../src/components/ui/sonner";

figma.connect(
  Toaster,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=11840-54058",
  {
    props: {
      richColors: figma.enum("richColors?", {
        true: true,
        false: false,
      }),
    },
    example: ({ richColors }) => <Toaster richColors={richColors} />,
  }
);
