import figma from "@figma/code-connect";
import {
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "../src/components/ui/typography";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=19942-186062";

figma.connect(TypographyH1, FIGMA_URL, {
  variant: { Type: "H1" },
  example: () => <TypographyH1>Taxing Laughter. It's a literal hot mess.</TypographyH1>,
});

figma.connect(TypographyH2, FIGMA_URL, {
  variant: { Type: "H2" },
  example: () => <TypographyH2>The People of the Kingdom</TypographyH2>,
});

figma.connect(TypographyH3, FIGMA_URL, {
  variant: { Type: "H3" },
  example: () => <TypographyH3>The Joke Tax</TypographyH3>,
});

figma.connect(TypographyH4, FIGMA_URL, {
  variant: { Type: "H4" },
  example: () => <TypographyH4>People stopped telling jokes</TypographyH4>,
});

figma.connect(TypographyP, FIGMA_URL, {
  variant: { Type: "P" },
  example: () => (
    <TypographyP>
      The king, seeing how much happier his subjects were, realized the error of his ways and repealed the joke tax.
    </TypographyP>
  ),
});

figma.connect(TypographyLead, FIGMA_URL, {
  variant: { Type: "Lead" },
  example: () => (
    <TypographyLead>A modal dialog that interrupts the user with important content.</TypographyLead>
  ),
});

figma.connect(TypographyLarge, FIGMA_URL, {
  variant: { Type: "Large" },
  example: () => <TypographyLarge>Are you absolutely sure?</TypographyLarge>,
});

figma.connect(TypographySmall, FIGMA_URL, {
  variant: { Type: "Small" },
  example: () => <TypographySmall>Email address</TypographySmall>,
});

figma.connect(TypographyMuted, FIGMA_URL, {
  variant: { Type: "Muted" },
  example: () => <TypographyMuted>Enter your email address.</TypographyMuted>,
});

figma.connect(TypographyBlockquote, FIGMA_URL, {
  variant: { Type: "Blockquote" },
  example: () => (
    <TypographyBlockquote>
      "After all," he said, "everyone enjoys a good joke, so it's only fair they should pay for the privilege."
    </TypographyBlockquote>
  ),
});

figma.connect(TypographyInlineCode, FIGMA_URL, {
  variant: { Type: "Inline Code" },
  example: () => <TypographyInlineCode>@radix-ui/react-alert-dialog</TypographyInlineCode>,
});

figma.connect(TypographyList, FIGMA_URL, {
  variant: { Type: "List" },
  example: () => (
    <TypographyList>
      <li>1st level of puberty: Potty</li>
      <li>2nd level of puberty: Buberty</li>
      <li>3rd level of puberty: Suberty</li>
    </TypographyList>
  ),
});
