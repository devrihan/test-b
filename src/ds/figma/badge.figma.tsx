import figma from "@figma/code-connect";
import { Badge } from "../src/components/ui/badge";

figma.connect(
  Badge,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=11818-12358",
  {
    props: {
      children: figma.textContent("Badge text"),
      variant: figma.enum("Type", {
        Default: "default",
        Secondary: "secondary",
        Destructive: "destructive",
        Outline: "outline",
      }),
    },
    example: ({ children, variant }) => <Badge variant={variant}>{children}</Badge>,
  }
);
