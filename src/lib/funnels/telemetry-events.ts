/**
 * The DOM event name a public form dispatches after a successful capture, and
 * the funnel tracker listens for.
 *
 * Its own module so neither side imports the other's component — the form is
 * used far outside funnels (/f/[formId], web chat, embeds) and must not pull
 * funnel code into its bundle just to name an event.
 */
export const FUNNEL_SUBMIT_EVENT = "divinex:funnel-submitted";
