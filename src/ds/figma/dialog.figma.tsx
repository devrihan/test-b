import figma from "@figma/code-connect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../src/components/ui/dialog";
import { Button } from "../src/components/ui/button";

figma.connect(
  Dialog,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=12026-52640",
  {
    example: () => (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline">Cancel</Button>
            <Button>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  }
);
