import figma from "@figma/code-connect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../src/components/ui/alert-dialog";
import { Button } from "../src/components/ui/button";

figma.connect(
  AlertDialog,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=12025-59973",
  {
    props: {
      title: figma.textContent("header"),
      description: figma.textContent("description"),
    },
    example: ({ title, description }) => (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline">Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  }
);
