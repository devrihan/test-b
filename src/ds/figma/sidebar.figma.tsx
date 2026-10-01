import figma from "@figma/code-connect";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../src/components/ui/sidebar";

figma.connect(
  Sidebar,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=12040-54922",
  {
    props: {
      collapsible: figma.enum("Collasped", {
        true: "icon",
        false: "offcanvas",
      }),
    },
    example: ({ collapsible }) => (
      <SidebarProvider>
        <Sidebar collapsible={collapsible}>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Dashboard</SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    ),
  }
);
