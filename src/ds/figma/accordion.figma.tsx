import figma from "@figma/code-connect";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../src/components/ui/accordion";

figma.connect(
  Accordion,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8805-6831",
  {
    example: () => (
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Is it accessible?</AccordionTrigger>
          <AccordionContent>
            Yes. It adheres to the WAI-ARIA design pattern.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Is it styled?</AccordionTrigger>
          <AccordionContent>
            Yes. It comes with default styles that match the other components.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  }
);
