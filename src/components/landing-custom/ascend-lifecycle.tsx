import { LifecycleFlow } from "./lifecycle-flow";

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

export function AscendLifecycle() {
  return (
    <section className="border-t py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Stop guessing what to fix next.
          </h2>
          {/* "Most marketing tools give you more things to manage" was the
              same argument the closing line of this section already makes,
              two paragraphs apart. One statement of it is enough. */}
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Ascend finds the problem, helps you build the fix, and puts your
            follow-up in motion.
          </p>
        </div>

        <div className="mt-14">
          <LifecycleFlow />
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-muted-foreground">
          Most marketing tools start at <span className="font-medium text-foreground">Create</span>.
          Ascend starts one step earlier.
        </p>
      </div>
    </section>
  );
}
