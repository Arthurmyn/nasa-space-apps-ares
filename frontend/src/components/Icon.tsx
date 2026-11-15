import type { SVGProps } from "react";

/** Project-authored 16px stroke icons. No third-party icon set. */
const PATHS = {
  check: "M3 8.5l3.2 3.2L13 4.8",
  alert: "M8 2.2l6.2 11H1.8L8 2.2zM8 6.6v3.2M8 11.6v.4",
  octagon: "M5.2 1.8h5.6l3.4 3.4v5.6l-3.4 3.4H5.2l-3.4-3.4V5.2l3.4-3.4zM5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8",
  info: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.2v4M8 4.9v.2",
  layers: "M8 2l6 3.2L8 8.4 2 5.2 8 2zM2 8.2l6 3.2 6-3.2M2 11l6 3.2 6-3.2",
  route: "M3.5 13a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM12.5 6.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM5.3 11.2h4.2a2 2 0 0 0 0-4H6.5a2 2 0 0 1 0-4h4.2",
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  close: "M3.5 3.5l9 9M12.5 3.5l-9 9",
  refresh: "M13.5 8a5.5 5.5 0 1 1-1.7-4M13.5 2.5v3h-3",
  compare: "M2 4h7M2 8h12M2 12h9M11 2.5l2 1.5-2 1.5",
  chevron: "M4 6l4 4 4-4",
  print: "M4.5 6V2h7v4M4.5 11.5h-2V6.5h11v5h-2M4.5 9.5h7v4.5h-7z",
  wifiOff: "M2 2l12 12M1.6 6.2a9 9 0 0 1 3-1.8M14.4 6.2a9 9 0 0 0-4.4-2M4.2 9a5.5 5.5 0 0 1 2-1.1M11.8 9a5.5 5.5 0 0 0-1.6-1M8 12.4v.2",
  crosshair: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 .8v3M8 12.2v3M.8 8h3M12.2 8h3",
  trash: "M3 4.5h10M6.2 4.5V3h3.6v1.5M4.5 4.5l.6 8.7h5.8l.6-8.7",
  flag: "M4 14V2.5M4 3h7.5l-1.6 2.6L11.5 8H4",
  mountain: "M1.5 13.5l4.2-7.2 2.6 4.2 1.7-2.6 4.5 5.6H1.5z",
  clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.8V8l2.2 1.4",
  menu: "M2.5 4h11M2.5 8h11M2.5 12h11",
  globe: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM2 8h12M8 2c-2.2 1.7-2.2 10.3 0 12M8 2c2.2 1.7 2.2 10.3 0 12",
  map: "M1.5 3.5l4.2-1.5 4.6 1.5 4.2-1.5v10.5l-4.2 1.5-4.6-1.5-4.2 1.5V3.5zM5.7 2v10.5M10.3 3.5V14",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

/** Decorative by default (aria-hidden). Always pair with a visible text label. */
export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
