import * as React from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary shadow-lg shadow-primary/30" : "bg-secondary border-border/50",
          className
        )}
      >
        <input 
          type="checkbox" 
          ref={ref} 
          checked={checked} 
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="sr-only" 
          {...props} 
        />
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-all duration-300",
            checked ? "translate-x-5 bg-primary-foreground" : "translate-x-0.5 bg-muted-foreground"
          )}
        />
      </button>
    )
  }
)

Switch.displayName = "Switch"
