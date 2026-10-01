import figma from "@figma/code-connect";
import { DataTable } from "../src/components/ui/data-table";

figma.connect(
  DataTable,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=11862-63657",
  {
    example: () => (
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "status", header: "Status" },
        ]}
        data={[{ name: "Invoice", status: "Paid" }]}
      />
    ),
  }
);
