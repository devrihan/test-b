import figma from "@figma/code-connect";
import { Textarea } from "../src/components/ui/textarea";
import { Label } from "../src/components/ui/label";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8-268";

// With label.
figma.connect(Textarea, FIGMA_URL, {
  variant: { "Label?": true },
  props: {
    placeholder: figma.textContent("Type your message here"),
    disabled: figma.enum("State", {
      Default: false,
      Active: false,
      Filled: false,
      Error: false,
      Disabled: true,
    }),
  },
  example: ({ placeholder, disabled }) => (
    <div className="grid gap-2">
      <Label htmlFor="message">Your message</Label>
      <Textarea id="message" placeholder={placeholder} disabled={disabled} />
    </div>
  ),
});

// Without label.
figma.connect(Textarea, FIGMA_URL, {
  variant: { "Label?": false },
  props: {
    placeholder: figma.textContent("Type your message here"),
    disabled: figma.enum("State", {
      Default: false,
      Active: false,
      Filled: false,
      Error: false,
      Disabled: true,
    }),
  },
  example: ({ placeholder, disabled }) => (
    <Textarea placeholder={placeholder} disabled={disabled} />
  ),
});
