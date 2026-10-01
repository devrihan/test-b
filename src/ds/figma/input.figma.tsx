import figma from "@figma/code-connect";
import { Input } from "../src/components/ui/input";
import { Label } from "../src/components/ui/label";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6814-7290";

figma.connect(Input, FIGMA_URL, {
  props: {
    label: figma.string("Label"),
    placeholder: figma.string("Placeholder"),
    disabled: figma.enum("State", {
      Default: false,
      Active: false,
      Filled: false,
      Error: false,
      Disabled: true,
    }),
  },
  example: ({ label, placeholder, disabled }) => (
    <div className="grid gap-2">
      <Label htmlFor="email">{label}</Label>
      <Input id="email" placeholder={placeholder} disabled={disabled} />
    </div>
  ),
});
