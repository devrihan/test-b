import figma from "@figma/code-connect";
import {
  DropdownSelect,
  DropdownSelectContent,
  DropdownSelectItem,
  DropdownSelectTrigger,
  DropdownSelectValue,
} from "../src/components/ui/dropdown-select";

figma.connect(
  DropdownSelect,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6869-8809",
  {
    example: () => (
      <DropdownSelect>
        <DropdownSelectTrigger>
          <DropdownSelectValue placeholder="Select a value" />
        </DropdownSelectTrigger>
        <DropdownSelectContent>
          <DropdownSelectItem value="apple">Apple</DropdownSelectItem>
          <DropdownSelectItem value="banana">Banana</DropdownSelectItem>
        </DropdownSelectContent>
      </DropdownSelect>
    ),
  }
);
