import figma from "@figma/code-connect";
import { DatePicker } from "../src/components/ui/date-picker";

figma.connect(
  DatePicker,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8805-43922",
  {
    props: {
      disabled: figma.enum("State", {
        Default: false,
        Hover: false,
        Disabled: true,
      }),
    },
    example: ({ disabled }) => (
      <DatePicker disabled={disabled} date={new Date(2026, 0, 1)} />
    ),
  }
);
