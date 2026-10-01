// Pending Figma component creation.
//
// The source component is ready, but the Inferentics Figma file does not yet
// publish a top-level Drawer component or component set. Once that node exists,
// replace FIGMA_URL with the published component URL and uncomment the mapping
// below.
//
// import figma from "@figma/code-connect";
// import { Button } from "../src/components/ui/button";
// import {
//   Drawer,
//   DrawerClose,
//   DrawerContent,
//   DrawerDescription,
//   DrawerFooter,
//   DrawerHeader,
//   DrawerTitle,
//   DrawerTrigger,
// } from "../src/components/ui/drawer";
//
// const FIGMA_URL = "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/Inferentics-Design-System?node-id=...";
//
// figma.connect(Drawer, FIGMA_URL, {
//   props: {
//     title: figma.string("Title"),
//     description: figma.string("Description"),
//     showFooter: figma.boolean("Footer?", {
//       true: true,
//       false: false,
//     }),
//   },
//   example: ({ title, description, showFooter }) => (
//     <Drawer>
//       <DrawerTrigger asChild>
//         <Button variant="outline">Open Drawer</Button>
//       </DrawerTrigger>
//       <DrawerContent>
//         <DrawerHeader>
//           <DrawerTitle>{title}</DrawerTitle>
//           <DrawerDescription>{description}</DrawerDescription>
//         </DrawerHeader>
//         {showFooter && (
//           <DrawerFooter>
//             <Button>Submit</Button>
//             <DrawerClose asChild>
//               <Button variant="outline">Cancel</Button>
//             </DrawerClose>
//           </DrawerFooter>
//         )}
//       </DrawerContent>
//     </Drawer>
//   ),
// });
