/** Public URL of a file of a site's grid, for example "hillshade.png". Served under /app/. */
export const siteFileUrl = (siteId: string, file: string): string =>
  `${import.meta.env.BASE_URL}data/${encodeURIComponent(siteId)}/${file}`;

/** Public URL of a large image of a site kept outside the 3 MB grid budget, for example "optical.jpg". */
export const siteImageryUrl = (siteId: string, file: string): string =>
  `${import.meta.env.BASE_URL}imagery/${encodeURIComponent(siteId)}/${file}`;
