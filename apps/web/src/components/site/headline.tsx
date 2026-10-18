import clsx from 'clsx';

// Words a headline's second half usually starts with (EN + RU)
const BREAK = new Set(['on', 'in', 'from', 'to', 'of', 'for', 'with', 'this', 'what', 'at', 'by', 'на', 'в', 'во', 'от', 'до', 'для', 'с', 'со', 'по', 'из', 'к', 'что', 'этого', 'этом']);

/** Splits a headline in two: white lead, greyed-out tail — before the first preposition, else after a comma, else halfway */
export function splitHeadline(text: string): [string, string] {
  const comma = text.match(/^(.+?[,—:])\s+(.+)$/);
  if (comma) return [comma[1], comma[2]];
  const words = text.split(/\s+/);
  if (words.length < 3) return [text, ''];
  const at = words.findIndex((w, i) => i > 0 && i < words.length - 1 && BREAK.has(w.toLowerCase()));
  const cut = at > 0 ? at : Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

export function Headline({ text, as: Tag = 'h2', className, id }: { text: string; as?: 'h1' | 'h2' | 'h3'; className?: string; id?: string }) {
  const [lead, tail] = splitHeadline(text);
  return (
    <Tag id={id} className={clsx('display', className)}>
      {lead}
      {tail && (
        <>
          {' '}
          <span className="dim">{tail}</span>
        </>
      )}
    </Tag>
  );
}
