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
  const thumb = (p) => p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.replaceWith('${CATEGORY[p.category].icon}')">`
    : CATEGORY[p.category].icon;

  function render(filter) {
    const list = filter === "all" ? products : products.filter((p) => p.category === filter);
    $("#productGrid").innerHTML = !list.length
      ? `<p class="grid__empty">New items in this category are coming soon — message us on WhatsApp to ask!</p>`
      : list.map((p) => `
      <article class="product">
        <div class="product__img" style="background:${CATEGORY[p.category].bg}">
          ${thumb(p)}
          ${p.soldOut ? `<span class="badge badge--Sold">Sold out</span>`
            : p.badge ? `<span class="badge badge--${p.badge}">${p.badge}</span>` : ""}
        </div>
        <div class="product__body">
          <span class="product__cat">${CATEGORY[p.category].label}</span>
          <h3 class="product__name">${esc(p.name)}</h3>
          ${p.sizes.length > 1
            ? `<select class="size" id="size-${p.id}" aria-label="Choose size">${p.sizes.map((s) => `<option>${esc(s)}</option>`).join("")}</select>`
            : `<span class="product__sizes">${esc(p.sizes[0])}</span>`}
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
  // Each line is { id, size, qty }; the same product in two sizes is two lines.
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
    $("#checkout").disabled = !cart.length;
    $("#checkout").style.opacity = cart.length ? 1 : .5;

    $("#cartItems").innerHTML = cart.length ? cart.map((i, n) => {
      const p = find(i.id);
      return `
        <div class="cart-item">
          <div class="cart-item__img" style="background:${CATEGORY[p.category].bg}">${thumb(p)}</div>
          <div>
            <h4>${esc(p.name)}</h4>
            <small>${money(p.price)} · ${esc(i.size)}</small>
            <div class="qty">
              <button data-dec="${n}" aria-label="Decrease">−</button>
              <span>${i.qty}</span>
              <button data-inc="${n}" aria-label="Increase">+</button>
            </div>
          </div>
          <button class="remove" data-rm="${n}">Remove</button>
        </div>`;
    }).join("") : `<p class="cart__empty">Your bag is empty 🧸<br>Add something cute!</p>`;
    save();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.id) {
      const p = find(t.dataset.id);
      const sel = document.getElementById(`size-${p.id}`);
      const size = sel ? sel.value : p.sizes[0];
      const item = cart.find((i) => i.id === p.id && i.size === size);
      item ? item.qty++ : cart.push({ id: p.id, size, qty: 1 });
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
  const closeCart = () => document.body.classList.remove("cart-open");
  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);
  $("#zoneSelect").addEventListener("change", renderCart);
  $("#orderForm").addEventListener("input", (e) => e.target.classList.remove("invalid"));

  $("#checkout").addEventListener("click", () => {
    if (!cart.length) return;
    const form = $("#orderForm");
    const missing = ["name", "zone", "area"].map((n) => form.elements[n]).filter((el) => !el.value.trim());
    missing.forEach((el) => el.classList.add("invalid"));
    if (missing.length) { toast("Please fill in your name & delivery details"); missing[0].focus(); return; }

    const z = zone();
    const lines = cart.map((i) => {
      const p = find(i.id);
      return `• ${p.name} (${i.size}) x${i.qty} — ${money(p.price * i.qty)}`;
    });
    const msg = [
      `Hello ${SHOP.name}! 👋 I'd like to place an order:`,
      "",
      ...lines,
      "",
      `Subtotal: ${money(subtotal())}`,
      `Delivery (${z.zone}): ${money(z.fee)}`,
      `*Total: ${money(subtotal() + z.fee)}*`,
      "",
      `Name: ${form.elements.name.value.trim()}`,
      `Location: ${form.elements.area.value.trim()}`,
    ].join("\n");
    window.open(waLink(msg), "_blank");
  });

  // ---------- Contact form -> WhatsApp ----------
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    window.open(waLink(`Hello, my name is ${f.get("name")}.\n\n${f.get("message")}`), "_blank");
  });

  $("#productGrid").innerHTML = `<p class="grid__empty">Loading our latest collection…</p>`;
  ProductSource.load().then((list) => {
    products = list;
    cart = cart.filter((i) => i.size && find(String(i.id)) && !find(String(i.id)).soldOut)
      .map((i) => ({ ...i, id: String(i.id) }));
    render("all");
    renderCart();
  });
})();
