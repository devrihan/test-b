import figma from "@figma/code-connect";
import { Checkbox } from "../src/components/ui/checkbox";
import { Label } from "../src/components/ui/label";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6813-6943";

figma.connect(Checkbox, FIGMA_URL, {
  variant: { Type: "Checkbox Only" },
  props: {
    checked: figma.enum("State", {
      Empty: false,
      Filled: true,
      Indeterminate: "indeterminate",
    }),
    disabled: figma.enum("Disabled", { yes: true, no: false }),
  },
  example: ({ checked, disabled }) => (
    <Checkbox checked={checked} disabled={disabled} />
  ),
});

figma.connect(Checkbox, FIGMA_URL, {
  variant: { Type: "With Label" },
  props: {
    label: figma.string("Label text"),
    checked: figma.enum("State", {
      Empty: false,
      Filled: true,
      Indeterminate: "indeterminate",
    }),
    disabled: figma.enum("Disabled", { yes: true, no: false }),
  },
  example: ({ label, checked, disabled }) => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" checked={checked} disabled={disabled} />
      <Label htmlFor="terms">{label}</Label>
    </div>
  ),
});

figma.connect(Checkbox, FIGMA_URL, {
  variant: { Type: "Label + Caption" },
  props: {
    label: figma.string("Label text"),
    caption: figma.string("Caption Text"),
    checked: figma.enum("State", {
      Empty: false,
      Filled: true,
      Indeterminate: "indeterminate",
    }),
    disabled: figma.enum("Disabled", { yes: true, no: false }),
  },
  example: ({ label, caption, checked, disabled }) => (
    <div className="flex items-start gap-2">
      <Checkbox id="notifications" checked={checked} disabled={disabled} />
      <div className="grid gap-1.5 leading-none">
        <Label htmlFor="notifications">{label}</Label>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
    </div>
  ),
});
