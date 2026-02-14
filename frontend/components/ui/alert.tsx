import * as React from "react";
import { cn } from "@/lib/utils";

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(
      "relative w-full rounded-lg border px-4 py-3 text-sm flex items-start gap-3",
      variant === "destructive" && "border-red-200 bg-red-50 text-red-800",
      variant === "default" && "border-amber-200 bg-amber-50 text-amber-900",
      className
    )}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex-1 flex items-center flex-wrap gap-2", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription };
