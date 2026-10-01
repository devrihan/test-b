import figma from "@figma/code-connect";
import { Button } from "../src/components/ui/button";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=6807-2468";

// Default Button (with optional leading/trailing icon slots).
figma.connect(Button, FIGMA_URL, {
  variant: { "Icon Only": "false" },
  props: {
    children: figma.string("Label"),
    variant: figma.enum("Type", {
      Primary: "default",
      Secondary: "secondary",
      Outline: "outline",
      Ghost: "ghost",
      Link: "link",
      Error: "destructive",
    }),
    size: figma.enum("Size", {
      default: "default",
      sm: "sm",
      lg: "lg",
    }),
    disabled: figma.enum("State", {
      Default: false,
      Hover: false,
      Loading: false,
      Disabled: true,
    }),
    leadingIcon: figma.boolean("Leading Visual?", {
      true: figma.instance("Leading Visual"),
      false: undefined,
    }),
    trailingIcon: figma.boolean("Trailing Visual?", {
      true: figma.instance("Trailing Visual"),
      false: undefined,
    }),
  },
  example: ({ children, variant, size, disabled, leadingIcon, trailingIcon }) => (
    <Button variant={variant} size={size} disabled={disabled}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </Button>
  ),
});

// Icon-only Button — switches size to "icon" and renders the Icon slot as the sole child.
figma.connect(Button, FIGMA_URL, {
  variant: { "Icon Only": "true" },
  props: {
    variant: figma.enum("Type", {
      Primary: "default",
      Secondary: "secondary",
      Outline: "outline",
      Ghost: "ghost",
      Link: "link",
      Error: "destructive",
    }),
    icon: figma.instance("Icon"),
    disabled: figma.enum("State", {
      Default: false,
      Hover: false,
      Loading: false,
      Disabled: true,
    }),
  },
  example: ({ variant, icon, disabled }) => (
    <Button variant={variant} size="icon" disabled={disabled}>
      {icon}
    </Button>
  ),
});
