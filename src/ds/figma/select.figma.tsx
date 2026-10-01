import figma from "@figma/code-connect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../src/components/ui/select";

figma.connect(
  Select,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6869-8809",
  {
    example: () => (
      <Select>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="cherry">Cherry</SelectItem>
        </SelectContent>
      </Select>
    ),
  }
);
