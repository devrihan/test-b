import figma from "@figma/code-connect";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../src/components/ui/toggle-group";

figma.connect(
  ToggleGroup,
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
      <ToggleGroup type="single" variant={variant} size={size}>
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
        <ToggleGroupItem value="center">Center</ToggleGroupItem>
        <ToggleGroupItem value="right">Right</ToggleGroupItem>
      </ToggleGroup>
    ),
  }
);
