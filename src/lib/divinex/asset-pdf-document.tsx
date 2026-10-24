import "server-only";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * BUG-010 — a generated Asset Studio deliverable ("Lead Magnet Full Draft",
 * "Proposal", etc.) had no export at all: AscendAssetsSection's only action
 * was "Copy" to the clipboard. For a lead magnet specifically, that's a real
 * dead end — the funnel's Files & delivery upload needs an actual FILE, and
 * there was no document-generation path to produce one. Reuses the
 * @react-pdf/renderer engine Quotes already ships (lib/quotes/pdf-render.tsx)
 * rather than adding a second PDF library.
 *
 * Deliberately generic: every Asset Studio deliverable shares the same
 * {title, content} shape (content.ts's AssetRow), so one renderer covers all
 * of them rather than special-casing lead magnets.
 *
 * The content is plain text written by the generator, not markdown. The only
 * structure worth honoring on the page: blank-line-separated paragraphs, and
 * short ALL-CAPS or Title-Case lines standing alone (the generator's own
 * section-heading convention) get a little visual weight. No markdown
 * parsing — guessing at syntax the generator never promised to emit would
 * risk mangling real content more than it helps.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1a1a22",
    lineHeight: 1.5,
  },
  eyebrow: {
    fontSize: 9,
    color: "#6b6b76",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 20,
  },
  heading: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bulletMark: {
    width: 14,
  },
  bulletText: {
    flex: 1,
  },
});

/** A standalone line is treated as a heading when it's short and doesn't end
 *  mid-sentence — the generator's own convention for section titles. */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 70) return false;
  if (/[.,;:]$/.test(t)) return false;
  return /^[A-Z0-9][^a-z]*$/.test(t) || /^#{1,3}\s/.test(t);
}

function isBullet(line: string): boolean {
  return /^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
}

function stripBulletMarker(line: string): string {
  return line.replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+[.)]\s+/, "");
}

export function AssetPdfDocument({
  title,
  assetType,
  content,
}: {
  title: string;
  assetType: string;
  content: string;
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ type: "heading" | "paragraph" | "bullet"; text: string }> = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      blocks.push({ type: "paragraph", text: buffer.join(" ").trim() });
      buffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (looksLikeHeading(line)) {
      flush();
      blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s*/, "") });
      continue;
    }
    if (isBullet(line)) {
      flush();
      blocks.push({ type: "bullet", text: stripBulletMarker(line) });
      continue;
    }
    buffer.push(line);
  }
  flush();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>{assetType}</Text>
        <Text style={styles.title}>{title}</Text>
        {blocks.map((b, i) =>
          b.type === "heading" ? (
            <Text key={i} style={styles.heading}>
              {b.text}
            </Text>
          ) : b.type === "bullet" ? (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletMark}>{"•"}</Text>
              <Text style={styles.bulletText}>{b.text}</Text>
            </View>
          ) : (
            <Text key={i} style={styles.paragraph}>
              {b.text}
            </Text>
          ),
        )}
      </Page>
    </Document>
  );
}
