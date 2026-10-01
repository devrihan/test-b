import figma from "@figma/code-connect";
import { Avatar, AvatarImage, AvatarFallback } from "../src/components/ui/avatar";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8-297";

// With photo — AvatarImage with a placeholder src.
figma.connect(Avatar, FIGMA_URL, {
  variant: { Type: "With Photo" },
  example: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
});

// No photo — initials only via AvatarFallback.
figma.connect(Avatar, FIGMA_URL, {
  variant: { Type: "No photo" },
  example: () => (
    <Avatar>
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
});
