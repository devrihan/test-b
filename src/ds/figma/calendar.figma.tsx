import figma from "@figma/code-connect";
import { Calendar } from "../src/components/ui/calendar";

figma.connect(
  Calendar,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8805-39448",
  {
    example: () => <Calendar mode="single" className="rounded-md border" />,
  }
);
