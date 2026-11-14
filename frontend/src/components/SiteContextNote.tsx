import { Icon } from "./Icon.tsx";
import { useSiteScienceContext } from "../state/SiteContext.tsx";

/** "Why this site": a few cited sentences about the place. Shown under the stops in Plan. */
export function SiteContextNote() {
  const context = useSiteScienceContext();
  if (!context) return null;
  return (
    <section className="panel__section" aria-labelledby="site-context-title">
      <header className="panel__head">
        <h2 id="site-context-title" className="panel__title">
          <Icon name="info" /> {context.title}
        </h2>
      </header>
      <p className="site-context__text">{context.text}</p>
      <ul className="site-context__sources">
        {context.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
            , {s.credit}
          </li>
        ))}
      </ul>
    </section>
  );
}
