import figma from "@figma/code-connect";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../src/components/ui/empty";
import { Button } from "../src/components/ui/button";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185846";

figma.connect(Empty, FIGMA_URL, {
  variant: { Variant: "Default" },
  example: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" />
        <EmptyTitle>No results found</EmptyTitle>
        <EmptyDescription>Try adjusting your filters or search.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
});

figma.connect(Empty, FIGMA_URL, {
  variant: { Variant: "With Action" },
  example: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" />
        <EmptyTitle>No results found</EmptyTitle>
        <EmptyDescription>Try adjusting your filters or search.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Clear filters</Button>
      </EmptyContent>
    </Empty>
  ),
});

figma.connect(Empty, FIGMA_URL, {
  variant: { Variant: "Text Only" },
  example: () => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No results found</EmptyTitle>
        <EmptyDescription>Try adjusting your filters or search.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
});
