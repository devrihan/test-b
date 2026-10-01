import figma from "@figma/code-connect";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../src/components/ui/collapsible";

figma.connect(
  Collapsible,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=13-2293",
  {
    props: {
      open: figma.enum("State", {
        Opened: true,
        Closed: false,
      }),
    },
    example: ({ open }) => (
      <Collapsible open={open}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    ),
  }
);
