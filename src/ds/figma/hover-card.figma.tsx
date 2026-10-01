import figma from "@figma/code-connect";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../src/components/ui/hover-card";

figma.connect(
  HoverCard,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6902-30416",
  {
    example: () => (
      <HoverCard>
        <HoverCardTrigger>Hover</HoverCardTrigger>
        <HoverCardContent>Hover card content</HoverCardContent>
      </HoverCard>
    ),
  }
);
