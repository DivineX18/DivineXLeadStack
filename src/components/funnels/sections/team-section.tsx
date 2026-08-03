import { User } from "lucide-react";
import type { TeamConfig } from "@/types/funnels";

export function TeamSection({
  config,
  accentColor,
}: {
  config: TeamConfig;
  accentColor: string;
}) {
  if (config.members.length === 0) return null;
  const cols = config.members.length === 1 ? "sm:grid-cols-1" : config.members.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {config.headline && (
          <h2
            className="mb-8 text-balance text-center font-extrabold tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", lineHeight: 1.15 }}
          >
            {config.headline}
          </h2>
        )}
        <div className={`grid grid-cols-1 gap-6 ${cols}`}>
          {config.members.map((m, i) => (
            <div key={i} className="text-center">
              {m.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.photoUrl}
                  alt=""
                  className="mx-auto h-24 w-24 rounded-full object-cover shadow-md ring-2"
                  style={{ borderColor: accentColor } as React.CSSProperties}
                />
              ) : (
                <span
                  className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
                >
                  <User className="h-9 w-9" />
                </span>
              )}
              <p className="mt-4 font-bold tracking-tight">{m.name}</p>
              <p className="text-sm opacity-60">{m.role}</p>
              {m.bio && <p className="mt-2 text-sm leading-relaxed opacity-75">{m.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
