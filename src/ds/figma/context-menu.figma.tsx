import figma from "@figma/code-connect";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../src/components/ui/context-menu";

figma.connect(
  ContextMenu,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6816-10544",
  {
    example: () => (
      <ContextMenu>
        <ContextMenuTrigger>Right click</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Profile</ContextMenuItem>
          <ContextMenuItem>Settings</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
  }
);
