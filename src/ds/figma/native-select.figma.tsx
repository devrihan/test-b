import figma from "@figma/code-connect";
import {
  NativeSelect,
  NativeSelectOption,
} from "../src/components/ui/native-select";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185953";

figma.connect(NativeSelect, FIGMA_URL, {
  props: {
    disabled: figma.enum("State", {
      Default: false,
      Filled: false,
      Invalid: false,
      Disabled: true,
    }),
    invalid: figma.enum("State", {
      Default: false,
      Filled: false,
      Invalid: true,
      Disabled: false,
    }),
  },
  example: ({ disabled, invalid }) => (
    <NativeSelect disabled={disabled} aria-invalid={invalid}>
      <NativeSelectOption value="">Select a fruit</NativeSelectOption>
      <NativeSelectOption value="apple">Apple</NativeSelectOption>
      <NativeSelectOption value="banana">Banana</NativeSelectOption>
    </NativeSelect>
  ),
});
