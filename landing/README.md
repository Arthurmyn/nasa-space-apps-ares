# ARES landing page

Static page for the site root (`/`). Plain Vite and TypeScript, no runtime dependencies. The planner lives in [`../frontend`](../frontend) and is served under `/app/`.

```bash
npm install
npm run dev     # http://localhost:5175 (proxies /app to :5173 and /api to :8000)
npm run build   # type check, then build to dist/
```

Content comes from `docs/` (research notes and the system specification). Keep to the wording policy there: say "candidate route", never "safe route"; no real-time weather or radiation; label every claim as working, in progress or planned. The "Honest status" section must be updated when the prototype changes.

Fonts are self-hosted (OFL, see `../ASSETS.md`). No images, cookies or tracking.
