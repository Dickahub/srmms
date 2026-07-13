import type { ReactNode } from "react";

// Minimal, dependency-free rendering of the assistant's structured replies:
// **bold** spans, "- "/"* " bullet lists, "1. "/"1) " numbered lists, paragraphs.
// Not a general markdown parser — just enough for what Gemini's French diagnostic
// replies actually use.

function renderInline(text: string, keyPrefix: string): ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
  return segments.map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`}>{seg.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{seg}</span>
    ),
  );
}

export function renderMarkdownLite(text: string): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let listOrdered = false;

  function flushList() {
    if (listBuffer.length === 0) return;
    const items = listBuffer.map((item, i) => <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>);
    blocks.push(
      listOrdered ? (
        <ol key={`list-${blocks.length}`} className="list-decimal space-y-0.5 pl-5">{items}</ol>
      ) : (
        <ul key={`list-${blocks.length}`} className="list-disc space-y-0.5 pl-5">{items}</ul>
      ),
    );
    listBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (bulletMatch || numberedMatch) {
      if (listBuffer.length === 0) listOrdered = !!numberedMatch;
      listBuffer.push((bulletMatch ?? numberedMatch)![1]);
    } else {
      flushList();
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flushList();
  return blocks;
}
