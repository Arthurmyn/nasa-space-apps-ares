import { ApiError } from "./types.ts";

/**
 * Plain-language message for the UI. It never includes raw server text or stack traces, with one
 * exception: the `detail` of a 422, which the API writes as the reason a route is impossible.
 * `labelFor` turns point ids in that text ("stop-1") into what the map shows ("Stop A").
 */
export function describeError(error: unknown, labelFor?: (pointId: string) => string | null): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong while planning the route. Retry in a moment.";
  }
  switch (error.kind) {
    case "network":
      return "Cannot reach the route service. Check that the backend is running, then retry.";
    case "timeout":
      return "The route service took too long to answer. Retry in a moment.";
    case "invalid":
      return "The route service sent data the app cannot read. Tell the backend team.";
    case "aborted":
      return "The request was cancelled.";
    case "http":
      if (error.status === 422 && error.detail) {
        const reason = error.detail.replace(/'(start|stop-\d+)'/g, (quoted, id: string) => {
          const label = labelFor?.(id);
          return label ? `'${label}'` : quoted;
        });
        return `No route: ${reason} Move a point and try again.`;
      }
      if (error.status === 422 || error.status === 400) {
        return "The route service rejected these points. Move a stop and try again.";
      }
      if (error.status === 404) {
        return "The route service has no route endpoint yet. Check the API version.";
      }
      return `The route service returned an error${error.status ? ` (status ${error.status})` : ""}. Retry in a moment.`;
  }
}
