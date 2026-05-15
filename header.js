// header.js — shared nav loader

(async () => {
  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  let html, firms;
  try {
    [html, firms] = await Promise.all([
      fetch(`${prefix}header.html`).then((r) => r.text()),
      fetch(`${prefix}data/firms-nav.json`).then((r) => r.json()),
    ]);
  } catch {
    return;
  }

  const placeholder = document.getElementById("header");
  if (!placeholder) return;

  // Parse fetched HTML into a temp container
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  // Move the <style> to the END of <body> so it comes after all
  // page-level inline styles and wins the cascade without !important
  const style = tmp.querySelector("style");
  if (style) {
    tmp.removeChild(style);
    document.body.appendChild(style);
  }

  // Inject the header markup where the placeholder was
  placeholder.outerHTML = tmp.innerHTML;

  // Populate dynamic firm links from firms-nav.json
  const firmsNav = document.getElementById("bt-firms-nav");
  if (firmsNav && firms) {
    firmsNav.innerHTML = firms.map((f) => `<a href="${f.path}">${f.name}</a>`).join("\n");
  }

  // --- Dropdown toggle (sets .open on parent .bt-dropdown) ---
  const closeAllDropdowns = () => {
    document.querySelectorAll(".bt-dropdown.open").forEach((d) => d.classList.remove("open"));
  };

  document.querySelectorAll("[data-dropdown]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = btn.closest(".bt-dropdown");
      const isOpen = dropdown?.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) dropdown?.classList.add("open");
    });
  });

  document.addEventListener("click", closeAllDropdowns);

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

  // --- Rewards link auth-aware swap ---
  // If a Supabase session exists in localStorage, point "Rewards" at the account
  // dashboard and rename it. Reads localStorage directly so we don't have to
  // bundle supabase-js on every page just for this.
  const rewardsLink = document.getElementById("btRewardsLink");
  if (rewardsLink) {
    try {
      let signedIn = false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
        const raw = localStorage.getItem(k);
        const obj = raw ? JSON.parse(raw) : null;
        if (obj?.user?.id || obj?.currentSession?.user?.id) {
          signedIn = true;
          break;
        }
      }
      if (signedIn) {
        rewardsLink.setAttribute("href", "/rewards/account.html");
        rewardsLink.textContent = "My Rewards";
      }
    } catch (e) {}
  }
})();
