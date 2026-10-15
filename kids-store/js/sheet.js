/* =========================================================
   Loads products from the owner's Google Sheet (filled by the
   "Add product" Google Form). If no sheet is set in config.js,
   or it can't be reached, the list in products.js is used.

   Columns are matched by their header text, so the order of
   columns in the sheet doesn't matter:
     Product name | Category | Price | Old price | Sizes | Badge | Photo | Status
   Status: leave empty to show, "Sold out" to show as sold out,
           "Hide" (or "No") to remove it from the website.
   ========================================================= */
const ProductSource = (function () {
  const CATEGORIES = ["baby", "girls", "boys", "shoes", "accessories", "essentials"];

  // Minimal CSV parser that handles quoted fields, commas and line breaks.
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim()));
  }

  // Google Drive share links -> a resized, embeddable image URL.
  function photoUrl(value) {
    const first = (value || "").split(/[,\s]+/).find(Boolean) || "";
    const m = first.match(/(?:id=|\/d\/)([\w-]{20,})/);
    if (m && /google\.com/.test(first)) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
    return first;
  }

  const num = (v) => {
    const n = parseFloat(String(v || "").replace(/[^\d.]/g, ""));
    return isNaN(n) ? 0 : n;
  };

  function hashId(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return "p" + (h >>> 0).toString(36);
  }

  function rowsToProducts(rows) {
    const head = rows[0].map((h) => h.toLowerCase().trim());
    const col = (test) => head.findIndex(test);
    const c = {
      time:   col((h) => h.includes("timestamp")),
      name:   col((h) => h.includes("name")),
      cat:    col((h) => h.includes("categor")),
      price:  col((h) => h.includes("price") && !h.includes("old")),
      old:    col((h) => h.includes("old")),
      sizes:  col((h) => h.includes("size")),
      badge:  col((h) => h.includes("badge") || h.includes("label")),
      photo:  col((h) => h.includes("photo") || h.includes("image") || h.includes("picture")),
      status: col((h) => h.includes("status") || h === "show"),
    };
    if (c.name < 0 || c.price < 0) throw new Error("Sheet needs 'Product name' and 'Price' columns");
    const get = (r, i) => (i >= 0 && r[i] ? r[i].trim() : "");

    return rows.slice(1).map((r) => {
      const status = get(r, c.status).toLowerCase();
      const cat = get(r, c.cat).toLowerCase();
      const badge = get(r, c.badge);
      return {
        id: hashId(get(r, c.time) + "|" + get(r, c.name)),
        name: get(r, c.name),
        category: CATEGORIES.find((k) => cat.startsWith(k.slice(0, 4))) || "essentials",
        price: num(get(r, c.price)),
        oldPrice: num(get(r, c.old)) || undefined,
        sizes: get(r, c.sizes).split(",").map((s) => s.trim()).filter(Boolean),
        badge: /^(new|hot|sale)$/i.test(badge) ? badge[0].toUpperCase() + badge.slice(1).toLowerCase() : "",
        image: photoUrl(get(r, c.photo)),
        soldOut: status.includes("sold"),
        hidden: /^(hide|hidden|no)$/.test(status),
      };
    })
      .filter((p) => p.name && p.price && !p.hidden)
      .map((p) => (p.sizes.length ? p : { ...p, sizes: ["One size"] }))
      .reverse(); // newest submissions first
  }

  async function load() {
    const fallback = PRODUCTS.map((p) => ({ ...p, id: String(p.id) }));
    if (!SHOP.productsSheet) return fallback;
    try {
      const res = await fetch(SHOP.productsSheet, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const list = rowsToProducts(parseCSV(await res.text()));
      return list.length ? list : fallback;
    } catch (e) {
      console.warn("Could not load products from Google Sheet, using products.js instead:", e);
      return fallback;
    }
  }

  return { load };
})();
