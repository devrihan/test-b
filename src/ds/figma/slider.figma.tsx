import figma from "@figma/code-connect";
import { Slider } from "../src/components/ui/slider";

figma.connect(
  Slider,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6906-20998",
  {
    props: {
      value: figma.enum("Value", {
        "0%": [0],
        "50%": [50],
        "100%": [100],
      }),
    },
    example: ({ value }) => <Slider value={value} />,
  }
);
