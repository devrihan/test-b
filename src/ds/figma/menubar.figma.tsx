import figma from "@figma/code-connect";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "../src/components/ui/menubar";

figma.connect(
  Menubar,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8-314",
  {
    example: () => (
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New</MenubarItem>
            <MenubarItem>Open</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ),
  }
);
