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
