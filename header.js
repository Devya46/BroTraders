// header.js — shared nav loader
// Fetches header.html and injects it into #header, then wires up
// dropdown toggles, hamburger menu and scroll-shrink behaviour.

(async () => {
  // Compute path prefix so this works from any subdirectory depth
  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  let html;
  try {
    html = await fetch(`${prefix}header.html`).then((r) => r.text());
  } catch {
    return;
  }

  const placeholder = document.getElementById("header");
  if (!placeholder) return;
  placeholder.outerHTML = html;

  // --- Dropdown toggle ---
  document.querySelectorAll("[data-dropdown]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.dropdown;
      const menu = document.getElementById(id);
      if (!menu) return;
      const isOpen = menu.classList.contains("open");
      // Close all open menus first
      document.querySelectorAll(".bt-drop-menu.open").forEach((m) => m.classList.remove("open"));
      if (!isOpen) menu.classList.add("open");
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", () => {
    document.querySelectorAll(".bt-drop-menu.open").forEach((m) => m.classList.remove("open"));
  });

  // --- Mobile hamburger ---
  const hamburger = document.getElementById("hamburgerBtn");
  const nav = document.querySelector(".bt-nav");
  hamburger?.addEventListener("click", () => {
    nav?.classList.toggle("open");
    hamburger.classList.toggle("open");
  });

  document.querySelector(".bt-mobile-close")?.addEventListener("click", () => {
    nav?.classList.remove("open");
    hamburger?.classList.remove("open");
  });

  // --- Scroll shrink ---
  const header = document.querySelector(".bt-header");
  const onScroll = () => header?.classList.toggle("bt-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
