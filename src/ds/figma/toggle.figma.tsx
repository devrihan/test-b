import figma from "@figma/code-connect";
import { Toggle } from "../src/components/ui/toggle";

figma.connect(
  Toggle,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=11825-55656",
  {
    props: {
      variant: figma.enum("Type", {
        Ghost: "default",
        Outline: "outline",
      }),
      size: figma.enum("Size", {
        small: "sm",
        default: "default",
        large: "lg",
      }),
    },
    example: ({ variant, size }) => (
      <Toggle variant={variant} size={size}>
        Toggle
      </Toggle>
    ),
  }
);
