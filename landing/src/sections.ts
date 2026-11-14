// Behaviour for the sections below the hero: header plate on scroll, pause the hero video
// when it is covered, and close the mobile menu after choosing a section.
const plate = document.querySelector<HTMLElement>(".bar-bg");
const video = document.querySelector<HTMLVideoElement>("video.sky");
const bar = document.querySelector<HTMLElement>(".bar");
const menuBtn = document.getElementById("menu-btn");

function onScroll(): void {
  const covered = window.scrollY > window.innerHeight * 0.6;
  plate?.classList.toggle("is-on", window.scrollY > 24);
  if (!video) return;
  if (window.scrollY > window.innerHeight * 1.05) video.pause();
  else if (video.paused && !covered && document.visibilityState === "visible") void video.play().catch(() => undefined);
}

window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

bar?.querySelectorAll<HTMLAnchorElement>(".sheet a").forEach((a) =>
  a.addEventListener("click", () => {
    bar.dataset.open = "false";
    menuBtn?.setAttribute("aria-expanded", "false");
    menuBtn?.setAttribute("aria-label", "Menu");
  }),
);

// ---- Scroll reveals ----
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduceMotion && "IntersectionObserver" in window) {
  const mark = (selector: string, kind: string, staggerSiblings = false): void => {
    document.querySelectorAll<HTMLElement>(selector).forEach((el, i) => {
      if (el.dataset.reveal) return;
      el.dataset.reveal = kind;
      if (staggerSiblings) el.style.setProperty("--i", String(Math.min(i % 6, 5)));
    });
  };
  mark(".sections h2, .sections .lead", "rise");
  mark(".grid > *", "stagger", true);
  mark(".facts, .table-wrap, .note, .callout, .split > *, .demo figcaption", "fade");
  document.documentElement.classList.add("reveal");

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
}

// ---- Header arrow: only while the page is at the top ----
bar?.classList.toggle("is-scrolled", window.scrollY > 40);
window.addEventListener(
  "scroll",
  () => bar?.classList.toggle("is-scrolled", window.scrollY > 40),
  { passive: true },
);

// ---- "Get a demo": scroll to the video and start it once it is on screen ----
const demo = document.getElementById("demo-video") as HTMLVideoElement | null;
let playOnArrival = false;
document.querySelectorAll<HTMLAnchorElement>('a[href="#demo"]').forEach((a) =>
  a.addEventListener("click", () => {
    playOnArrival = true;
  }),
);
if (demo && "IntersectionObserver" in window) {
  new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting && entry.intersectionRatio > 0.6 && playOnArrival) {
        playOnArrival = false;
        demo.muted = true; // the video has no sound track
        void demo.play().catch(() => undefined);
      } else if (!entry.isIntersecting && !demo.paused) {
        demo.pause(); // be polite once the viewer has scrolled away
      }
    },
    { threshold: [0, 0.6] },
  ).observe(demo);
}

// ---- Planets drift only while the call-to-action block is on screen ----
const band = document.querySelector<HTMLElement>(".cta-band");
if (band && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => band.classList.toggle("is-live", !!entry?.isIntersecting), { threshold: 0.05 }).observe(band);
}
