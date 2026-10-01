import figma from "@figma/code-connect";
import { Progress } from "../src/components/ui/progress";

figma.connect(
  Progress,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6901-26302",
  {
    example: () => <Progress value={50} />,
  }
);
