import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Nhận diện KBIT: bo xl, viền slate, focus ring primary, font Roboto
        "h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-1 text-base font-roboto text-slate-900 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-60 aria-invalid:border-red-400 aria-invalid:ring-2 aria-invalid:ring-red-400/30 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
