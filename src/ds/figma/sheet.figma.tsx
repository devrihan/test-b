import figma from "@figma/code-connect";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../src/components/ui/sheet";
import { Button } from "../src/components/ui/button";

figma.connect(
  Sheet,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=168-1864",
  {
    example: () => (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Open</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit profile</SheetTitle>
            <SheetDescription>
              Make changes to your profile here.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button>Save changes</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    ),
  }
);
