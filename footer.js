// footer.js — shared footer loader

(async () => {
  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  let html, firms;
  try {
    [html, firms] = await Promise.all([
      fetch(`${prefix}footer.html`).then((r) => r.text()),
      fetch(`${prefix}data/firms-nav.json`).then((r) => r.json()),
    ]);
  } catch {
    return;
  }

  const placeholder = document.getElementById("footer");
  if (!placeholder) return;

  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  // Move <link> and <style> to end of body so they load correctly
  tmp.querySelectorAll("link, style").forEach((el) => {
    tmp.removeChild(el);
    document.body.appendChild(el);
  });

  placeholder.outerHTML = tmp.innerHTML;

  // Populate dynamic firm links from firms-nav.json
  const firmsFooter = document.getElementById("bt-firms-footer");
  if (firmsFooter && firms) {
    firmsFooter.innerHTML = firms.map((f) => `<a href="${f.path}">${f.name}</a>`).join("\n");
  }
})();
