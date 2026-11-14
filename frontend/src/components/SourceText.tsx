const UNVERIFIED = /^TO VERIFY\b:?\s*/i;

/**
 * A source line. The data team marks sources that are not checked yet with "TO VERIFY"; show
 * that as an "Unverified" label instead of raw text, in the summary and on the printed card.
 */
export function SourceText({ text }: { text: string }) {
  if (!UNVERIFIED.test(text)) return <>{text}</>;
  return (
    <>
      <span className="tag tag--warn">Unverified</span> {text.replace(UNVERIFIED, "")}
    </>
  );
}
