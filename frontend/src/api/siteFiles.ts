/** Public URL of a file of a site's grid, for example "hillshade.png". Served under /app/. */
export const siteFileUrl = (siteId: string, file: string): string =>
  `${import.meta.env.BASE_URL}data/${encodeURIComponent(siteId)}/${file}`;
