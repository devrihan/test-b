import figma from "@figma/code-connect";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../src/components/ui/carousel";

figma.connect(
  Carousel,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=12025-64871",
  {
    example: () => (
      <Carousel className="w-full max-w-xs">
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
          <CarouselItem>Slide 2</CarouselItem>
          <CarouselItem>Slide 3</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    ),
  }
);
