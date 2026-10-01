import figma from "@figma/code-connect";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../src/components/ui/chart";

figma.connect(
  ChartContainer,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=8835-5385",
  {
    example: () => (
      <ChartContainer
        config={{
          desktop: {
            label: "Desktop",
            color: "var(--chart-1)",
          },
          mobile: {
            label: "Mobile",
            color: "var(--chart-2)",
          },
        }}
      >
        <BarChart
          accessibilityLayer
          data={[
            { month: "January", desktop: 186, mobile: 80 },
            { month: "February", desktop: 305, mobile: 200 },
            { month: "March", desktop: 237, mobile: 120 },
          ]}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
          <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
        </BarChart>
      </ChartContainer>
    ),
  }
);
