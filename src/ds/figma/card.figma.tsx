import figma from "@figma/code-connect";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../src/components/ui/card";
import { Button } from "../src/components/ui/button";

const FIGMA_URL =
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8805-38095";

// Card with footer (two buttons).
figma.connect(Card, FIGMA_URL, {
  variant: { "Card Footer": true, Description: true },
  props: {
    title: figma.textContent("Card Header"),
    description: figma.textContent("Card Description"),
    body: figma.textContent("p"),
  },
  example: ({ title, description, body }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p>{body}</p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button>Continue</Button>
      </CardFooter>
    </Card>
  ),
});

// Card without footer.
figma.connect(Card, FIGMA_URL, {
  variant: { "Card Footer": false, Description: true },
  props: {
    title: figma.textContent("Card Header"),
    description: figma.textContent("Card Description"),
    body: figma.textContent("p"),
  },
  example: ({ title, description, body }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p>{body}</p>
      </CardContent>
    </Card>
  ),
});

// Card without description.
figma.connect(Card, FIGMA_URL, {
  variant: { Description: false },
  props: {
    title: figma.textContent("Card Header"),
    body: figma.textContent("p"),
  },
  example: ({ title, body }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{body}</p>
      </CardContent>
    </Card>
  ),
});
