import figma from "@figma/code-connect";
import { TextInputControl } from "../src/components/ui/form-controls";

figma.connect(
  TextInputControl,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6814-7362",
  {
    props: {
      disabled: figma.enum("Disabled", {
        yes: true,
        no: false,
      }),
    },
    example: ({ disabled }) => (
      <TextInputControl label="Label Text" disabled={disabled} placeholder="Value" />
    ),
  }
);
