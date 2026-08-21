import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border p-5 transition-all duration-300 [&>svg]:absolute [&>svg]:left-5 [&>svg]:top-5 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-card border-border/50 text-foreground",
        destructive:
          "border-rose-500/30 text-rose-400 [&>svg]:text-rose-400 bg-rose-500/5",
        warning:
          "border-amber-500/30 text-amber-400 [&>svg]:text-amber-400 bg-amber-500/5",
        success:
          "border-emerald-500/30 text-emerald-400 [&>svg]:text-emerald-400 bg-emerald-500/5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-black leading-none tracking-tight uppercase text-sm", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground font-mono", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
