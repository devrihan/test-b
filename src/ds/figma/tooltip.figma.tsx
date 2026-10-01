import figma from "@figma/code-connect";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../src/components/ui/tooltip";
import { Button } from "../src/components/ui/button";

figma.connect(
  Tooltip,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=12030-121167",
  {
    props: {
      content: figma.textContent("p"),
    },
    example: ({ content }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover</Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{content}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  }
);
