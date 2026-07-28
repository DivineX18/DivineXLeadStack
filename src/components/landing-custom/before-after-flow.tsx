import type { ResolvedBrand } from "@/config/landing";
import { X, Check } from "lucide-react";

const ROWS = [
  { before: "A lead texts, DMs, or fills out a form — and it lands in whichever inbox someone happens to check.", after: "Every channel writes into the same contact record, the moment it arrives." },
  { before: "First response depends on who's free and whether anyone saw the notification.", after: "An AI agent or automated sequence responds within seconds, day or night." },
  { before: "\"Where does this deal actually stand?\" has a different answer depending on who you ask.", after: "One pipeline, visible to the whole team, updated as it actually moves." },
  { before: "A quote gets typed up fresh in a document, then waits on a callback to get confirmed.", after: "A quote sends once and the client accepts or pays straight from their inbox." },
  { before: "A no-show happens because nobody remembered to send a reminder.", after: "Reminders and confirmations send themselves, every time, without being asked." },
  { before: "\"What's actually working?\" means exporting three tools into a spreadsheet to find out.", after: "One dashboard: pipeline funnel, revenue trend, and lead source, always current." },
];

export function BeforeAfterFlow({ brand }: { brand: ResolvedBrand }) {
  return (
    <section className="border-y bg-muted/20 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Before vs. After</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            What actually changes{" "}
            <span className="font-serif font-normal italic">with {brand.name}</span>
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border bg-card">
          <div className="grid grid-cols-2 border-b bg-muted/30 text-sm font-semibold">
            <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
              <X className="h-4 w-4 text-muted-foreground" /> Before
            </div>
            <div className="flex items-center gap-2 border-l px-4 py-3 sm:px-6">
              <Check className="h-4 w-4 text-primary" /> After
            </div>
          </div>
          {ROWS.map((row, i) => (
            <div
              key={row.before}
              className={`grid grid-cols-2 text-sm ${i !== ROWS.length - 1 ? "border-b" : ""}`}
            >
              <div className="px-4 py-4 text-muted-foreground sm:px-6">{row.before}</div>
              <div className="border-l px-4 py-4 text-foreground/90 sm:px-6">{row.after}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
