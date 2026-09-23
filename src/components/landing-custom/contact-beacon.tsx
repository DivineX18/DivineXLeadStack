"use client";

import { MessageCircle } from "lucide-react";

/**
 * THE QUIETEST MOTION ON THE PAGE, AND DELIBERATELY SO.
 *
 * Sits above the closing contact buttons to say "there is a person at the end
 * of this" before the visitor reads the offer to talk. It is last in the
 * page's motion hierarchy — the hero scan is the argument, the lifecycle strip
 * is the process, the industries rotate slowly, and this only breathes. If it
 * ever competes for attention with the hero, it is wrong.
 *
 * Two soft rings expand and fade on a long, offset cycle; nothing moves
 * quickly and nothing demands a click. `motion-reduce:` variants stop both
 * rings outright rather than merely slowing them, so a visitor who has asked
 * for stillness gets a plain icon.
 */
export function ContactBeacon() {
  return (
    <div className="mb-8 flex justify-center" aria-hidden="true">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/15 [animation-duration:3.5s] motion-reduce:animate-none" />
        <span className="absolute inset-1.5 animate-ping rounded-full bg-primary/10 [animation-duration:3.5s] [animation-delay:1.2s] motion-reduce:animate-none" />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" />
        </span>
      </span>
    </div>
  );
}
