import { useEffect, useState } from "react";

const two = (n: number) => String(n).padStart(2, "0");

/** The browser's current time in UTC, to the second, labelled UTC. */
export function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time className="topbar__time mono" dateTime={now.toISOString()}>
      {`${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())} UTC`}
    </time>
  );
}
