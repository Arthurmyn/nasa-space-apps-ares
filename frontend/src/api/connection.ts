export type ApiConnection = "unknown" | "online" | "offline" | "service-error" | "invalid" | "timeout";

let status: ApiConnection = "unknown";
const listeners = new Set<() => void>();

/** Connectivity of the last completed API request; caller cancellations do not count. */
export const apiConnection = {
  getSnapshot: () => status,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  set: (next: ApiConnection) => {
    if (next === status) return;
    status = next;
    listeners.forEach((listener) => listener());
  },
};
