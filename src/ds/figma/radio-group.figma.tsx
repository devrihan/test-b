import figma from "@figma/code-connect";
import { RadioGroup, RadioGroupItem } from "../src/components/ui/radio-group";
import { Label } from "../src/components/ui/label";

figma.connect(
  RadioGroup,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6815-9247",
  {
    example: () => (
      <RadioGroup defaultValue="option-one">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option-one" id="option-one" />
          <Label htmlFor="option-one">Option one</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option-two" id="option-two" />
          <Label htmlFor="option-two">Option two</Label>
        </div>
      </RadioGroup>
    ),
  }
);
