import figma from "@figma/code-connect";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../src/components/ui/input-group";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185898";

figma.connect(InputGroup, FIGMA_URL, {
  variant: { Leading: "True", Trailing: "False" },
  example: () => (
    <InputGroup>
      <InputGroupAddon>https://</InputGroupAddon>
      <InputGroupInput placeholder="you@example.com" />
    </InputGroup>
  ),
});

figma.connect(InputGroup, FIGMA_URL, {
  variant: { Leading: "False", Trailing: "True" },
  example: () => (
    <InputGroup>
      <InputGroupInput placeholder="you@example.com" />
      <InputGroupAddon align="inline-end">.com</InputGroupAddon>
    </InputGroup>
  ),
});

figma.connect(InputGroup, FIGMA_URL, {
  variant: { Leading: "True", Trailing: "True" },
  example: () => (
    <InputGroup>
      <InputGroupAddon>https://</InputGroupAddon>
      <InputGroupInput placeholder="you@example.com" />
      <InputGroupAddon align="inline-end">.com</InputGroupAddon>
    </InputGroup>
  ),
});

figma.connect(InputGroup, FIGMA_URL, {
  variant: { Leading: "False", Trailing: "Button" },
  example: () => (
    <InputGroup>
      <InputGroupInput placeholder="you@example.com" />
      <InputGroupButton variant="default">Send</InputGroupButton>
    </InputGroup>
  ),
});
