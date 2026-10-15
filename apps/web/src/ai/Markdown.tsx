import { Fragment, type ReactNode } from 'react';

const BULLET = /^\s*[-*•]\s+/;

/** **bold** → <strong>. Everything else stays text (React escapes it), so no HTML from the model renders. */
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={`${key}-${i}`} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${key}-${i}`}>{part}</Fragment>
    ),
  );
}

type Block = { kind: 'p' | 'ul'; lines: string[] };

/** Groups lines into paragraphs (split by blank lines) and bullet lists (consecutive "- " lines). */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of text.trim().split('\n')) {
    if (!line.trim()) {
      current = null;
      continue;
    }
    const kind = BULLET.test(line) ? 'ul' : 'p';
    if (!current || current.kind !== kind) {
      current = { kind, lines: [] };
      blocks.push(current);
    }
    current.lines.push(kind === 'ul' ? line.replace(BULLET, '') : line);
  }
  return blocks;
}

/** Light markdown for assistant replies: paragraphs, "- " bullets and **bold** (REQUIREMENTS §17.11). */
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {toBlocks(text).map((block, b) =>
        block.kind === 'ul' ? (
          <ul key={b} className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-slate-400">
            {block.lines.map((l, i) => (
              <li key={i}>{inline(l, `${b}-${i}`)}</li>
            ))}
          </ul>
        ) : (
          <p key={b} className="my-1.5 first:mt-0 last:mb-0">
            {block.lines.map((l, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {inline(l, `${b}-${i}`)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  );
}
