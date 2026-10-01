import figma from "@figma/code-connect";
import { Spinner } from "../src/components/ui/spinner";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185782";

figma.connect(Spinner, FIGMA_URL, {
  props: {
    size: figma.enum("Size", {
      Small: "size-4",
      Medium: "size-5",
      Large: "size-6",
    }),
  },
  example: ({ size }) => <Spinner className={size} />,
});
