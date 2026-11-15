export type StartMode = "overview" | "plan";

/**
 * The page the app opens on. The Mars overview is the default; a link that carries a plan
 * (#s=...&p=...), a site (?site=...) or ?mode=plan goes straight to the planner, so shared links
 * keep working.
 */
export function startMode(search: string, hash: string): StartMode {
  const query = new URLSearchParams(search);
  const mode = query.get("mode");
  if (mode === "plan") return "plan";
  if (mode === "overview") return "overview";
  if (query.has("site")) return "plan";
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has("s") || params.has("p") ? "plan" : "overview";
}
