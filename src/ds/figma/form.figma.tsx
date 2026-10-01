import figma from "@figma/code-connect";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../src/components/ui/form";
import { Input } from "../src/components/ui/input";

figma.connect(
  Form,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=6814-7362",
  {
    props: {
      label: figma.string("Text"),
    },
    example: ({ label }) => {
      const form = useForm({
        defaultValues: {
          email: "",
        },
      });

      return (
        <Form {...form}>
          <form>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormDescription>Enter your email address.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      );
    },
  }
);
