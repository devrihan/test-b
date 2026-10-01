import figma from "@figma/code-connect";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../src/components/ui/alert";

figma.connect(
  Alert,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=11817-1212",
  {
    props: {
      variant: figma.enum("Type", {
        Default: "default",
        Error: "destructive",
        Info: "default",
        Succes: "default",
        Warning: "default",
      }),
    },
    example: ({ variant }) => (
      <Alert variant={variant}>
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>
          You can add components to your app using the CLI.
        </AlertDescription>
      </Alert>
    ),
  }
);
