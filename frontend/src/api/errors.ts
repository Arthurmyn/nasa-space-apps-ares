import { ApiError } from "./types.ts";

/** Plain-language errors, including the backend's string explanation of invalid route points. */
export function describeError(error: unknown): string {
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
      if (error.status === 422 && error.detail) return error.detail;
      if (error.status === 422 || error.status === 400) {
        return "The route service rejected these points. Move a stop and try again.";
      }
      if (error.status === 404) {
        return "The route service has no route endpoint yet. Check the API version.";
      }
      return `The route service returned an error${error.status ? ` (status ${error.status})` : ""}. Retry in a moment.`;
  }
}
