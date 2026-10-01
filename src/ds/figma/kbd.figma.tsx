import figma from "@figma/code-connect";
import { Kbd } from "../src/components/ui/kbd";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185793";

figma.connect(Kbd, FIGMA_URL, {
  props: {
    value: figma.string("Value"),
  },
  example: ({ value }) => <Kbd>{value}</Kbd>,
});
