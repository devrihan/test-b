import figma from "@figma/code-connect";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../src/components/ui/item";
import { Button } from "../src/components/ui/button";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185938";

figma.connect(Item, FIGMA_URL, {
  props: {
    variant: figma.enum("Variant", {
      Default: "default" as const,
      Outline: "outline" as const,
      Muted: "muted" as const,
    }),
  },
  example: ({ variant }) => (
    <Item variant={variant}>
      <ItemMedia>J</ItemMedia>
      <ItemContent>
        <ItemTitle>Jordan Tan</ItemTitle>
        <ItemDescription>jordan@example.com</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button size="sm" variant="ghost">
          Open
        </Button>
      </ItemActions>
    </Item>
  ),
});
