const { normalizeVideoUrl } = await import("../src/lib/funnels/video-url.ts");
let bad = 0;
const t = (input: string, expect: string | null, label: string) => {
  const got = normalizeVideoUrl(input);
  const ok = expect === null ? got === null || got.provider === "other" : got?.embedUrl === expect;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` — got ${got?.embedUrl ?? "null"}`}`);
  if (!ok) bad++;
};
t("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "youtube watch");
t("https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "youtu.be short");
t("https://www.youtube.com/shorts/abc123XYZ_", "https://www.youtube.com/embed/abc123XYZ_", "youtube shorts");
t("https://www.youtube.com/watch?v=abc&t=90", "https://www.youtube.com/embed/abc?start=90", "youtube start time");
t("https://www.youtube.com/embed/abc", "https://www.youtube.com/embed/abc", "already an embed");
t("https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789", "vimeo");
t("https://player.vimeo.com/video/123456789", "https://player.vimeo.com/video/123456789", "vimeo player");
t("https://example.com/my.mp4", null, "unknown host passes through");
console.log(normalizeVideoUrl("") === null ? "PASS empty is null" : "FAIL empty");
console.log(normalizeVideoUrl("not a url") === null || normalizeVideoUrl("not a url")?.provider === "other" ? "PASS garbage safe" : "FAIL garbage");
process.exit(bad ? 1 : 0);
