import figma from "@figma/code-connect";
import { Combobox } from "../src/components/ui/combobox";

figma.connect(
  Combobox,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=11830-49906",
  {
    props: {
      disabled: figma.enum("State", {
        Default: false,
        Hover: false,
        Disabled: true,
      }),
    },
    example: ({ disabled }) => (
      <Combobox
        disabled={disabled}
        value="apple"
        options={[
          { value: "apple", label: "Apple" },
          { value: "banana", label: "Banana" },
        ]}
      />
    ),
  }
);
