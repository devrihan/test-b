import figma from "@figma/code-connect";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../src/components/ui/tabs";

figma.connect(
  Tabs,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6901-7650",
  {
    variant: { "Icon Only": false },
    example: () => (
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Account settings</TabsContent>
        <TabsContent value="password">Password settings</TabsContent>
      </Tabs>
    ),
  }
);

figma.connect(
  Tabs,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6901-7650",
  {
    variant: { "Icon Only": true },
    example: () => (
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">A</TabsTrigger>
          <TabsTrigger value="password">P</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Account settings</TabsContent>
        <TabsContent value="password">Password settings</TabsContent>
      </Tabs>
    ),
  }
);
