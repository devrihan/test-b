import figma from "@figma/code-connect";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "../src/components/ui/input-otp";

figma.connect(
  InputOTP,
  "https://www.figma.com/design/beVlo4Zk3uCzPtW83EJUUE/?node-id=1024-3283",
  {
    example: () => (
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    ),
  }
);
