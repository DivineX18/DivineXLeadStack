import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlowStep {
  icon: LucideIcon;
  label: string;
  detail?: string;
}

/**
 * A literal step-by-step process visual (trigger → action → result), distinct
 * from BusinessOperatingSystem's tabbed stage-switcher — this renders every
 * step at once as a connected chain, for processes meant to be read start to
 * finish in one glance (a form submission cascading into an SMS, an email, a
 * booking; a trigger firing a workflow). Horizontal on wide screens so it
 * reads left-to-right like the thing it depicts; stacks vertically on
 * mobile. The final step gets a filled "outcome" treatment (solid primary
 * fill + check) so the eye lands on where the process actually ends.
 */
export function StepFlow({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <div className={cn("flex flex-col items-stretch gap-0 md:flex-row md:items-center md:justify-center md:gap-0", className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={step.label} className="flex flex-col items-center md:flex-row">
            <div className="flex w-full flex-col items-center gap-2 rounded-xl border bg-card px-4 py-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:w-36">
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border-2",
                  isLast
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/30 bg-primary/5 text-primary",
                )}
              >
                {isLast ? <Check className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-xs font-semibold leading-tight text-foreground sm:text-sm">{step.label}</p>
                {step.detail && (
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{step.detail}</p>
                )}
              </div>
            </div>
            {!isLast && (
              <>
                <ArrowDown className="my-1 h-4 w-4 shrink-0 text-primary/40 md:hidden" aria-hidden="true" />
                <ArrowRight className="mx-1 hidden h-4 w-4 shrink-0 text-primary/40 md:block" aria-hidden="true" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
