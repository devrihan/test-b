import figma from "@figma/code-connect";
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "../src/components/ui/toast";

figma.connect(
  Toast,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=164-1441",
  {
    props: {
      variant: figma.enum("Type", {
        Default: "default",
        Destructive: "destructive",
      }),
    },
    example: ({ variant }) => (
      <ToastProvider>
        <Toast variant={variant}>
          <div className="grid gap-1">
            <ToastTitle>Scheduled</ToastTitle>
            <ToastDescription>Event has been created.</ToastDescription>
          </div>
          <ToastAction altText="Undo">Undo</ToastAction>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    ),
  }
);
