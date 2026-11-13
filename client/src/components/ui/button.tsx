import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer will-change-transform active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#EDFF72] text-[#111] hover:bg-[#d9ef4f] shadow-[0_10px_34px_-8px_rgba(237,255,114,0.45)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.55)] focus-visible:ring-[#EDFF72]",
        lime:
          "bg-[#EDFF72] text-[#111] hover:bg-[#d9ef4f] shadow-[0_10px_34px_-8px_rgba(237,255,114,0.45)] hover:shadow-[0_18px_40px_-8px_rgba(237,255,114,0.55)] focus-visible:ring-[#EDFF72]",
        ghost:
          "bg-white/[0.06] text-white hover:bg-white/[0.14] border border-white/20 focus-visible:ring-white/40",
        dark:
          "bg-[#191A1D] text-white hover:bg-[#252830] border border-white/10 focus-visible:ring-white/20",
        secondary:
          "bg-[#E9ECE7] text-[#171819] hover:bg-[#DDE1DA] border border-[#DDE1DA] focus-visible:ring-[#171819]",
        outline:
          "border border-[#DDE1DA] bg-transparent hover:bg-[#E9ECE7] text-[#171819] focus-visible:ring-[#171819]",
        link: "text-[#171819] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-3 text-sm",
        sm: "h-9 px-4 py-2 text-xs",
        lg: "h-14 px-8 py-4 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
export default Button;
