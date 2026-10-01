// Pending Figma component creation.
//
// The source component is ready, but the Inferentics Figma file does not yet
// publish a top-level Resizable component or component set. Once that node
// exists, replace FIGMA_URL with the published component URL and uncomment the
// mapping below.
//
// import figma from "@figma/code-connect";
// import {
//   ResizableHandle,
//   ResizablePanel,
//   ResizablePanelGroup,
// } from "../src/components/ui/resizable";
//
// const FIGMA_URL = "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=...";
//
// figma.connect(ResizablePanelGroup, FIGMA_URL, {
//   props: {
//     direction: figma.enum("Direction", {
//       Horizontal: "horizontal",
//       Vertical: "vertical",
//     }),
//     withHandle: figma.boolean("Handle?", {
//       true: true,
//       false: false,
//     }),
//   },
//   example: ({ direction, withHandle }) => (
//     <ResizablePanelGroup direction={direction}>
//       <ResizablePanel defaultSize={50}>One</ResizablePanel>
//       <ResizableHandle withHandle={withHandle} />
//       <ResizablePanel defaultSize={50}>Two</ResizablePanel>
//     </ResizablePanelGroup>
//   ),
// });
