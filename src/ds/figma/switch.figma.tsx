import figma from "@figma/code-connect";
import { Switch } from "../src/components/ui/switch";
import { Label } from "../src/components/ui/label";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6816-11766";

// Switch + label on right.
figma.connect(Switch, FIGMA_URL, {
  variant: { "Show label": true, "Label Position": "On Right" },
  props: {
    label: figma.string("Label"),
    checked: figma.enum("State", { Active: true, Inactive: false }),
    disabled: figma.enum("Disabled", { true: true, false: false }),
  },
  example: ({ label, checked, disabled }) => (
    <div className="flex items-center gap-2">
      <Switch checked={checked} disabled={disabled} />
      <Label>{label}</Label>
    </div>
  ),
});

// Switch + label on left.
figma.connect(Switch, FIGMA_URL, {
  variant: { "Show label": true, "Label Position": "On Left" },
  props: {
    label: figma.string("Label"),
    checked: figma.enum("State", { Active: true, Inactive: false }),
    disabled: figma.enum("Disabled", { true: true, false: false }),
  },
  example: ({ label, checked, disabled }) => (
    <div className="flex items-center gap-2">
      <Label>{label}</Label>
      <Switch checked={checked} disabled={disabled} />
    </div>
  ),
});

// Switch with no label.
figma.connect(Switch, FIGMA_URL, {
  variant: { "Show label": false },
  props: {
    checked: figma.enum("State", { Active: true, Inactive: false }),
    disabled: figma.enum("Disabled", { true: true, false: false }),
  },
  example: ({ checked, disabled }) => <Switch checked={checked} disabled={disabled} />,
});
