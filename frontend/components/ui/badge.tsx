import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
          {
            "bg-blue-100 text-blue-800": variant === "default",
            "bg-gray-100 text-gray-800": variant === "secondary",
            "bg-red-100 text-red-800": variant === "destructive",
            "border border-gray-300 bg-transparent": variant === "outline",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };

