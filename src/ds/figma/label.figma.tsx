import figma from "@figma/code-connect";
import { Label } from "../src/components/ui/label";

figma.connect(
  Label,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6814-7362",
  {
    props: {
      children: figma.string("Text"),
    },
    example: ({ children }) => <Label>{children}</Label>,
  }
);
