import figma from "@figma/code-connect";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../src/components/ui/popover";
import { Button } from "../src/components/ui/button";

figma.connect(
  Popover,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=13-888",
  {
    props: {
      content: figma.textContent("p"),
    },
    example: ({ content }) => (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open</Button>
        </PopoverTrigger>
        <PopoverContent>
          <p>{content}</p>
        </PopoverContent>
      </Popover>
    ),
  }
);
