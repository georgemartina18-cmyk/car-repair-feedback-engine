(function () {
  const CATEGORY = {
    baby:        { label: "Baby",        icon: "👶", bg: "#ffe4ea" },
    girls:       { label: "Girls",       icon: "👗", bg: "#f1eaff" },
    boys:        { label: "Boys",        icon: "👕", bg: "#e3f0ff" },
    shoes:       { label: "Shoes",       icon: "👟", bg: "#fff2d6" },
    accessories: { label: "Accessories", icon: "🎀", bg: "#ffe9f4" },
    essentials:  { label: "Essentials",  icon: "🍼", bg: "#ddf7f0" },
  };
  const money = (n) => `${SHOP.currency} ${n.toLocaleString("en-GH")}`;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let products = [];
  let loadError = false;

  // ---------- Shop details ----------
  $$("[data-shop]").forEach((el) => { el.textContent = SHOP[el.dataset.shop] || el.textContent; });
  if (!SHOP.email) $("#emailRow").remove();
  $("#year").textContent = new Date().getFullYear();

  const waLink = (text) => `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(text)}`;
  $$("[data-wa]").forEach((el) => {
    el.href = waLink(el.dataset.wa);
    el.target = "_blank";
    el.rel = "noopener";
  });

  $$("[data-social]").forEach((el) => {
    const url = SHOP.socials[el.dataset.social];
    if (url) el.href = url; else el.style.display = "none";
  });
  const names = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
  $("#footerSocial").innerHTML = Object.entries(SHOP.socials)
    .filter(([, url]) => url)
    .map(([k, url]) => `<a href="${url}" target="_blank" rel="noopener">${names[k] || k}</a>`)
    .join("");

  // ---------- Delivery zones ----------
  $("#deliveryZones").innerHTML = DELIVERY.map((z) => `
    <div class="zone">
      <div class="zone__top"><strong>${z.zone}</strong><span class="zone__fee">${money(z.fee)}</span></div>
      <span class="zone__eta">⏱ ${z.eta}</span>
      <span class="zone__towns">${z.towns}</span>
    </div>`).join("");
  $("#zoneSelect").innerHTML += DELIVERY.map((z) =>
    `<option value="${z.id}">${z.zone} — ${money(z.fee)}</option>`).join("");

  // ---------- Mobile menu ----------
  $("#menuBtn").addEventListener("click", () => $("#nav").classList.toggle("open"));
  $$("#nav a").forEach((a) => a.addEventListener("click", () => $("#nav").classList.remove("open")));

  // ---------- Products ----------
  // A photo that fails to load is swapped for the category icon.
  window.imgFail = (img) => {
    const s = document.createElement("span");
    s.className = "img-fallback";
    s.textContent = img.dataset.icon;
    img.replaceWith(s);
  };
  const photo = (p, src, alt) =>
    `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" data-icon="${CATEGORY[p.category].icon}" onerror="imgFail(this)">`;
  const thumb = (p) => p.image ? photo(p, p.image, p.name) : CATEGORY[p.category].icon;

  // Colour names the owner types (e.g. "Baby pink") -> a swatch colour, or null for text-only.
  const SWATCH = { cream: "#fff3d6", navy: "#1f2a5a", "navy blue": "#1f2a5a", wine: "#7b1e3a", maroon: "#800000",
    "baby pink": "#f9c6d3", "baby blue": "#a7d3f5", "sky blue": "#87ceeb", "army green": "#4b5320", ash: "#b2b2b2",
    mustard: "#e1ad01", peach: "#ffcba4", nude: "#e3bc9a", "off white": "#f6f1e7", "light blue": "#add8e6",
    "dark blue": "#00308f", "light pink": "#ffb6c1", "hot pink": "#ff69b4", "lemon": "#fff44f", "grey": "#9e9e9e" };
  const swatchColor = (name) => {
    const n = name.trim().toLowerCase();
    if (SWATCH[n]) return SWATCH[n];
    const compact = n.replace(/\s+/g, "");
    return window.CSS && CSS.supports("color", compact) ? compact : null;
  };
  const variantLabel = (i) => [i.size, i.color].filter(Boolean).join(" · ");

  function gallery(p) {
    const imgs = p.images && p.images.length ? p.images : (p.image ? [p.image] : []);
    if (!imgs.length) return CATEGORY[p.category].icon;
    return `<div class="gallery" data-gallery="${p.id}">${imgs.map((src, n) => photo(p, src, `${p.name} – photo ${n + 1}`)).join("")}</div>
      ${imgs.length > 1 ? `
        <button class="gal-btn gal-prev" data-gal="${p.id}" data-dir="-1" aria-label="Previous photo">‹</button>
        <button class="gal-btn gal-next" data-gal="${p.id}" data-dir="1" aria-label="Next photo">›</button>
        <div class="gal-dots" data-dots="${p.id}">${imgs.map((_, n) => `<i class="${n ? "" : "on"}"></i>`).join("")}</div>` : ""}`;
  }

  function colourPicker(p) {
    const colors = p.colors || [];
    if (!colors.length) return "";
    if (colors.length === 1) return `<span class="product__sizes">Colour: ${esc(colors[0])}</span>`;
    return `<div class="colors" data-colors="${p.id}" role="radiogroup" aria-label="Choose colour">
        ${colors.map((c, n) => {
          const sw = swatchColor(c);
          return `<button type="button" class="swatch${sw ? "" : " swatch--text"}${n ? "" : " is-on"}" data-color="${esc(c)}" data-idx="${n}"
            title="${esc(c)}" aria-label="${esc(c)}" role="radio" aria-checked="${n ? "false" : "true"}">${sw ? `<span style="background:${sw}"></span>` : esc(c)}</button>`;
        }).join("")}
      </div>
      <span class="color-name" data-colorname="${p.id}">Colour: <b>${esc(colors[0])}</b></span>`;
  }

  function render(filter) {
    const list = filter === "all" ? products : products.filter((p) => p.category === filter);
    $("#productGrid").innerHTML = !list.length
      ? `<p class="grid__empty">${loadError
          ? "We couldn't load our products just now. Please refresh the page"
          : products.length ? "New items in this category are coming soon" : "Our new collection is coming soon"}
          — or <a href="${waLink("Hello! What do you have in stock?")}" target="_blank" rel="noopener">message us on WhatsApp</a> to see what's available.</p>`
      : list.map((p) => `
      <article class="product">
        <div class="product__img" style="background:${CATEGORY[p.category].bg}">
          ${gallery(p)}
          ${p.soldOut ? `<span class="badge badge--Sold">Sold out</span>`
            : p.badge ? `<span class="badge badge--${p.badge}">${p.badge}</span>` : ""}
        </div>
        <div class="product__body">
          <span class="product__cat">${CATEGORY[p.category].label}</span>
          <h3 class="product__name">${esc(p.name)}</h3>
          ${p.sizes.length > 1
            ? `<select class="size" id="size-${p.id}" aria-label="Choose size">${p.sizes.map((s) => `<option>${esc(s)}</option>`).join("")}</select>`
            : `<span class="product__sizes">${esc(p.sizes[0])}</span>`}
          ${colourPicker(p)}
          <div class="product__row">
            <span class="price">${money(p.price)}${p.oldPrice ? `<s>${money(p.oldPrice)}</s>` : ""}</span>
            ${p.soldOut
              ? `<button class="add" disabled>Sold out</button>`
              : `<button class="add" data-id="${p.id}">Add to bag</button>`}
          </div>
        </div>
      </article>`).join("");
  }

  function setFilter(filter) {
    $$("#filters .chip").forEach((c) => c.classList.toggle("is-active", c.dataset.filter === filter));
    render(filter);
  }
  $$("#filters .chip").forEach((c) => c.addEventListener("click", () => setFilter(c.dataset.filter)));
  $$(".cat").forEach((c) => c.addEventListener("click", () => {
    setFilter(c.dataset.filter);
    $("#shop").scrollIntoView({ behavior: "smooth" });
  }));

  // ---------- Cart ----------
  // Each line is { id, size, color, qty }; each size/colour combination is its own line.
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("cart") || "[]"); } catch (e) { cart = []; }

  const save = () => { try { localStorage.setItem("cart", JSON.stringify(cart)); } catch (e) {} };
  const find = (id) => products.find((p) => p.id === id);
  const zone = () => DELIVERY.find((z) => z.id === $("#zoneSelect").value);
  const subtotal = () => cart.reduce((s, i) => s + find(i.id).price * i.qty, 0);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function renderCart() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const z = zone();
    $("#cartCount").textContent = count;
    $("#cartSubtotal").textContent = money(subtotal());
    $("#cartDelivery").textContent = z ? money(z.fee) : "Choose area";
    $("#cartTotal").textContent = money(subtotal() + (z && cart.length ? z.fee : 0));
    ["#checkout", "#placeOrder"].forEach((sel) => {
      const b = $(sel);
      if (b) { b.disabled = !cart.length; b.style.opacity = cart.length ? 1 : .5; }
    });

    $("#cartItems").innerHTML = cart.length ? cart.map((i, n) => {
      const p = find(i.id);
      return `
        <div class="cart-item">
          <div class="cart-item__img" style="background:${CATEGORY[p.category].bg}">${thumb(p)}</div>
          <div>
            <h4>${esc(p.name)}</h4>
            <small>${money(p.price)} · ${esc(variantLabel(i))}</small>
            <div class="qty">
              <button data-dec="${n}" aria-label="Decrease">−</button>
              <span>${i.qty}</span>
              <button data-inc="${n}" aria-label="Increase">+</button>
            </div>
          </div>
          <button class="remove" data-rm="${n}">Remove</button>
        </div>`;
    }).join("") : `<p class="cart__empty">Your bag is empty 🎈<br>Add something cute!</p>`;
    save();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.id) {
      const p = find(t.dataset.id);
      const sel = document.getElementById(`size-${p.id}`);
      const size = sel ? sel.value : p.sizes[0];
      const on = document.querySelector(`[data-colors="${p.id}"] .is-on`);
      const color = on ? on.dataset.color : (p.colors && p.colors[0]) || "";
      const item = cart.find((i) => i.id === p.id && i.size === size && (i.color || "") === color);
      item ? item.qty++ : cart.push({ id: p.id, size, color, qty: 1 });
      renderCart();
      toast(`Added to your bag ✓`);
    } else if (t.dataset.inc) {
      cart[+t.dataset.inc].qty++;
      renderCart();
    } else if (t.dataset.dec) {
      if (--cart[+t.dataset.dec].qty <= 0) cart.splice(+t.dataset.dec, 1);
      renderCart();
    } else if (t.dataset.rm) {
      cart.splice(+t.dataset.rm, 1);
      renderCart();
    }
  });

  const openCart = () => document.body.classList.add("cart-open");
  const closeCart = () => {
    document.body.classList.remove("cart-open");
    $("#cart").classList.remove("is-done");
  };
  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);
  $("#zoneSelect").addEventListener("change", renderCart);
  $("#orderForm").addEventListener("input", (e) => e.target.classList.remove("invalid"));

  // ---------- Photo galleries, colour picker & full-size viewer ----------
  const galleryEl = (id) => document.querySelector(`[data-gallery="${id}"]`);
  const scrollGallery = (g, n) => g && g.scrollTo({ left: n * g.clientWidth, behavior: "smooth" });

  document.addEventListener("scroll", (e) => {
    const g = e.target;
    if (!g.dataset || !g.dataset.gallery) return;
    const n = Math.round(g.scrollLeft / g.clientWidth);
    const dots = document.querySelector(`[data-dots="${g.dataset.gallery}"]`);
    if (dots) [...dots.children].forEach((d, k) => d.classList.toggle("on", k === n));
  }, true);

  const lb = { el: $("#lightbox"), img: $("#lbImg"), count: $("#lbCount"), list: [], n: 0, name: "" };
  function lbShow(n) {
    lb.n = (n + lb.list.length) % lb.list.length;
    lb.img.src = lb.list[lb.n].replace(/sz=w\d+/, "sz=w1600");
    lb.img.alt = `${lb.name} – photo ${lb.n + 1}`;
    lb.count.textContent = lb.list.length > 1 ? `${lb.n + 1} / ${lb.list.length}` : "";
    lb.el.classList.toggle("lightbox--single", lb.list.length < 2);
  }
  function lbOpen(p, n) {
    lb.list = p.images && p.images.length ? p.images : [p.image];
    lb.name = p.name;
    lbShow(n);
    lb.el.hidden = false;
    document.body.classList.add("lb-open");
  }
  function lbClose() { lb.el.hidden = true; document.body.classList.remove("lb-open"); }
  lb.el.addEventListener("click", (e) => {
    if (e.target.closest(".lb-prev")) lbShow(lb.n - 1);
    else if (e.target.closest(".lb-next")) lbShow(lb.n + 1);
    else if (e.target === lb.el || e.target.closest(".lb-close")) lbClose();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.el.hidden) return;
    if (e.key === "Escape") lbClose();
    if (e.key === "ArrowLeft") lbShow(lb.n - 1);
    if (e.key === "ArrowRight") lbShow(lb.n + 1);
  });

  $("#productGrid").addEventListener("click", (e) => {
    const nav = e.target.closest(".gal-btn");
    if (nav) {
      const g = galleryEl(nav.dataset.gal);
      const n = Math.round(g.scrollLeft / g.clientWidth) + Number(nav.dataset.dir);
      scrollGallery(g, (n + g.children.length) % g.children.length);
      return;
    }
    const img = e.target.closest(".gallery img");
    if (img) {
      const g = img.parentElement;
      lbOpen(find(g.dataset.gallery), [...g.children].indexOf(img));
      return;
    }
    const sw = e.target.closest(".swatch");
    if (sw) {
      const box = sw.parentElement, id = box.dataset.colors, p = find(id);
      box.querySelectorAll(".swatch").forEach((b) => { b.classList.toggle("is-on", b === sw); b.setAttribute("aria-checked", b === sw); });
      document.querySelector(`[data-colorname="${id}"]`).innerHTML = `Colour: <b>${esc(sw.dataset.color)}</b>`;
      // When there is one photo per colour (same order), show the matching photo.
      if (p.images && p.images.length === p.colors.length) scrollGallery(galleryEl(id), Number(sw.dataset.idx));
    }
  });

  // ---------- Checkout (on the website or via WhatsApp) ----------
  const form = $("#orderForm");
  const onlineOrders = Boolean(SHOP.ordersEndpoint);
  if (!onlineOrders) {
    // No order system connected yet: WhatsApp is the only way to order.
    $("#placeOrder").remove();
    form.elements.phone.remove();
    $("#checkout").textContent = "💬 Send order on WhatsApp";
  }

  const val = (n) => (form.elements[n] ? form.elements[n].value.trim() : "");

  function validate(fields) {
    const bad = fields.map((n) => form.elements[n]).filter((el) => el && !el.value.trim());
    if (form.elements.phone && fields.includes("phone") && val("phone").replace(/\D/g, "").length < 9) {
      if (!bad.includes(form.elements.phone)) bad.push(form.elements.phone);
    }
    bad.forEach((el) => el.classList.add("invalid"));
    if (bad.length) { toast("Please fill in the highlighted details"); bad[0].focus(); return false; }
    const z = zone();
    if (val("payment") === "Pay on delivery" && !z.cod) {
      toast("Pay on delivery is only available in Greater Accra");
      return false;
    }
    return true;
  }

  function orderSummary() {
    const z = zone();
    return {
      items: cart.map((i) => {
        const p = find(i.id);
        return { name: p.name, size: variantLabel(i), qty: i.qty, price: p.price, lineTotal: p.price * i.qty };
      }),
      zone: z.zone,
      subtotal: subtotal(),
      delivery: z.fee,
      total: subtotal() + z.fee,
    };
  }

  $("#checkout").addEventListener("click", () => {
    if (!cart.length || !validate(["name", "zone", "area"])) return;
    const o = orderSummary();
    const msg = [
      `Hello ${SHOP.name}! 👋 I'd like to place an order:`,
      "",
      ...o.items.map((i) => `• ${i.name} (${i.size}) x${i.qty} — ${money(i.lineTotal)}`),
      "",
      `Subtotal: ${money(o.subtotal)}`,
      `Delivery (${o.zone}): ${money(o.delivery)}`,
      `*Total: ${money(o.total)}*`,
      "",
      `Name: ${val("name")}`,
      `Location: ${val("area")}`,
      `Payment: ${val("payment")}`,
      ...(val("note") ? [`Note: ${val("note")}`] : []),
    ].join("\n");
    window.open(waLink(msg), "_blank");
  });

  const newOrderId = () => "AK-" + Date.now().toString(36).slice(-4).toUpperCase()
    + Math.random().toString(36).slice(2, 4).toUpperCase();

  $("#placeOrder") && $("#placeOrder").addEventListener("click", async () => {
    if (!cart.length || !validate(["name", "phone", "zone", "area"])) return;
    const btn = $("#placeOrder");
    const o = { ...orderSummary(), orderId: newOrderId(), name: val("name"), phone: val("phone"),
      area: val("area"), payment: val("payment"), note: val("note"), website: val("website") };

    btn.disabled = true;
    btn.textContent = "Sending your order…";
    try {
      // Sent as plain text so the browser makes a simple request Google accepts.
      const res = await fetch(SHOP.ordersEndpoint, { method: "POST", body: JSON.stringify(o) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Order not saved");
      showDone(o);
      cart = [];
      renderCart();
    } catch (e) {
      console.warn("Order failed:", e);
      toast("Sorry, we couldn't send your order. Please use the WhatsApp button.");
    } finally {
      btn.disabled = false;
      btn.textContent = "✅ Place order";
    }
  });

  function showDone(o) {
    const momo = SHOP.momo && SHOP.momo.number;
    $("#orderDone").innerHTML = `
      <div class="done__icon">🎉</div>
      <h3>Thank you, ${esc(o.name.split(" ")[0])}!</h3>
      <p>Your order <strong>${esc(o.orderId)}</strong> has been received.</p>
      <div class="done__box">
        <div><span>Total</span><strong>${money(o.total)}</strong></div>
        <div><span>Payment</span><strong>${esc(o.payment)}</strong></div>
      </div>
      <p>We'll call or WhatsApp you on <strong>${esc(o.phone)}</strong> shortly to confirm your order${o.payment === "Mobile Money" ? " and payment" : ""}.</p>
      ${o.payment === "Mobile Money" && momo ? `
        <div class="done__momo">
          <strong>📱 Pay with Mobile Money</strong>
          <span>Number: <b>${esc(SHOP.momo.number)}</b></span>
          <span>Name: <b>${esc(SHOP.momo.name)}</b></span>
          <span>Reference: <b>${esc(o.orderId)}</b></span>
          <small>Please wait for our confirmation call before paying.</small>
        </div>` : ""}
      <a class="btn btn--wa btn--block" target="_blank" rel="noopener"
         href="${waLink(`Hello ${SHOP.name}, I just placed order ${o.orderId} on your website.`)}">💬 Chat with us about this order</a>
      <button class="btn btn--ghost btn--block" id="doneClose">Continue shopping</button>`;
    $("#cart").classList.add("is-done");
  }

  document.addEventListener("click", (e) => {
    if (e.target.id === "doneClose") { $("#cart").classList.remove("is-done"); closeCart(); }
  });

  // ---------- Contact form -> WhatsApp ----------
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    window.open(waLink(`Hello, my name is ${f.get("name")}.\n\n${f.get("message")}`), "_blank");
  });

  $("#productGrid").innerHTML = `<p class="grid__empty">Loading our latest collection…</p>`;
  ProductSource.load().then(({ products: list, error }) => {
    products = list;
    if (error) loadError = true;
    cart = cart.filter((i) => i.size && find(String(i.id)) && !find(String(i.id)).soldOut)
      .map((i) => ({ ...i, id: String(i.id) }));
    render("all");
    renderCart();
  });
})();
