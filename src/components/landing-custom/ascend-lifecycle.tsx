import { Users, Search, PenLine, Inbox, Repeat, CircleCheck } from "lucide-react";
import { StepFlow } from "./step-flow";

/**
 * The section that earns the hero.
 *
 * One idea: you already have attention, and the step nobody sells you is the
 * one that tells you where it leaks. Everything else on the page is downstream
 * of the visitor accepting that. "Understand" is emphasised for exactly that
 * reason — it is the beat other tools skip, so it is the beat this diagram is
 * actually about.
 *
 * Deliberately no product names here. A first-time visitor should understand
 * what Ascend does before being asked to learn how it is assembled.
 */

const STEPS = [
  { icon: Users, label: "Traffic", detail: "You already have it" },
  { icon: Search, label: "Understand", detail: "What's costing you leads" },
  { icon: PenLine, label: "Create", detail: "Build the fix" },
  { icon: Inbox, label: "Capture", detail: "Pages, forms, booking" },
  { icon: Repeat, label: "Follow up", detail: "Automatically" },
  { icon: CircleCheck, label: "Customer", detail: "" },
];

export function AscendLifecycle() {
  return (
    <section className="border-t py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Stop guessing what your business needs next.
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Most marketing tools give you more things to manage. Ascend finds where you&rsquo;re
            losing opportunities, helps you create what&rsquo;s missing, and puts the follow-up in
            motion.
          </p>
        </div>

        <div className="mt-14">
          <StepFlow steps={STEPS} emphasizeIndex={1} />
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-muted-foreground">
          Every tool on the market starts at <span className="font-medium text-foreground">Create</span>.
          Ascend starts one step earlier.
        </p>
      </div>
    </section>
  );
}
