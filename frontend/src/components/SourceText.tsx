const UNVERIFIED = /^TO VERIFY\b:?\s*/i;

/** True for a source the data team has not checked yet. */
export const isUnverified = (text: string): boolean => UNVERIFIED.test(text);

/**
 * A source line. The data team marks sources that are not checked yet with "TO VERIFY"; show
 * that as an "Unverified" label instead of raw text, in the summary and on the printed card.
 */
export function SourceText({ text, label = "Unverified" }: { text: string; label?: string }) {
  if (!UNVERIFIED.test(text)) return <>{text}</>;
  return (
    <>
      <span className="tag tag--warn">{label}</span> {text.replace(UNVERIFIED, "")}
    </>
  );
}
