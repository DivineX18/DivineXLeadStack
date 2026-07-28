import type { ContentBlock } from "@/data/resources-posts";

export function ResourceBody({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="prose prose-neutral dark:prose-invert mx-auto max-w-2xl">
      {blocks.map((block, i) => {
        if (block.type === "h2") {
          return (
            <h2 key={i} className="mt-8 text-xl font-semibold tracking-tight">
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="mt-3 space-y-1.5">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-4 leading-relaxed text-muted-foreground">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
