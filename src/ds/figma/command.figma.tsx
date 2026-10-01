import figma from "@figma/code-connect";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../src/components/ui/command";

figma.connect(
  Command,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=8816-48413",
  {
    props: {
      placeholder: figma.string("Placeholder"),
    },
    example: ({ placeholder }) => (
      <Command>
        <CommandInput placeholder={placeholder} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem>
              Calendar
              <CommandShortcut>⌘K</CommandShortcut>
            </CommandItem>
            <CommandItem>Search</CommandItem>
            <CommandItem>Settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    ),
  }
);
