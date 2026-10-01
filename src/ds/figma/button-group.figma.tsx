import figma from "@figma/code-connect";
import {
  ButtonGroup,
  ButtonGroupButton,
} from "../src/components/ui/button-group";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185825";

figma.connect(ButtonGroup, FIGMA_URL, {
  props: {
    orientation: figma.enum("Orientation", {
      Horizontal: "horizontal",
      Vertical: "vertical",
    }),
  },
  example: ({ orientation }) => (
    <ButtonGroup orientation={orientation}>
      <ButtonGroupButton variant="outline">Previous</ButtonGroupButton>
      <ButtonGroupButton variant="outline">Current</ButtonGroupButton>
      <ButtonGroupButton variant="outline">Next</ButtonGroupButton>
    </ButtonGroup>
  ),
});
