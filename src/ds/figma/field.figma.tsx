import figma from "@figma/code-connect";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../src/components/ui/field";
import { Input } from "../src/components/ui/input";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-185873";

figma.connect(Field, FIGMA_URL, {
  variant: { Invalid: "False" },
  props: {
    orientation: figma.enum("Orientation", {
      Vertical: "vertical" as const,
      Horizontal: "horizontal" as const,
    }),
  },
  example: ({ orientation }) => (
    <Field orientation={orientation}>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" placeholder="Enter a value" />
      <FieldDescription>We'll never share your email.</FieldDescription>
    </Field>
  ),
});

figma.connect(Field, FIGMA_URL, {
  variant: { Invalid: "True" },
  props: {
    orientation: figma.enum("Orientation", {
      Vertical: "vertical" as const,
      Horizontal: "horizontal" as const,
    }),
  },
  example: ({ orientation }) => (
    <Field orientation={orientation} data-invalid>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" placeholder="Enter a value" aria-invalid />
      <FieldError>This field is required.</FieldError>
    </Field>
  ),
});
