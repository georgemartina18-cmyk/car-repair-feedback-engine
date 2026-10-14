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

  // ---------- Shop details ----------
  $$("[data-shop]").forEach((el) => { el.textContent = SHOP[el.dataset.shop] || el.textContent; });
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

  // ---------- Mobile menu ----------
  $("#menuBtn").addEventListener("click", () => $("#nav").classList.toggle("open"));
  $$("#nav a").forEach((a) => a.addEventListener("click", () => $("#nav").classList.remove("open")));

  // ---------- Products ----------
  const thumb = (p) => p.image
    ? `<img src="${p.image}" alt="${p.name}" loading="lazy">`
    : CATEGORY[p.category].icon;

  function render(filter) {
    const list = filter === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === filter);
    $("#productGrid").innerHTML = list.map((p) => `
      <article class="product">
        <div class="product__img" style="background:${CATEGORY[p.category].bg}">
          ${thumb(p)}
          ${p.badge ? `<span class="badge badge--${p.badge}">${p.badge}</span>` : ""}
        </div>
        <div class="product__body">
          <span class="product__cat">${CATEGORY[p.category].label}</span>
          <h3 class="product__name">${p.name}</h3>
          <span class="product__sizes">Sizes: ${p.sizes}</span>
          <div class="product__row">
            <span class="price">${money(p.price)}${p.oldPrice ? `<s>${money(p.oldPrice)}</s>` : ""}</span>
            <button class="add" data-id="${p.id}">Add to bag</button>
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
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("cart") || "[]"); } catch (e) { cart = []; }
  cart = cart.filter((i) => PRODUCTS.some((p) => p.id === i.id));

  const save = () => { try { localStorage.setItem("cart", JSON.stringify(cart)); } catch (e) {} };
  const find = (id) => PRODUCTS.find((p) => p.id === id);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function renderCart() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const total = cart.reduce((s, i) => s + find(i.id).price * i.qty, 0);
    $("#cartCount").textContent = count;
    $("#cartTotal").textContent = money(total);
    $("#checkout").disabled = !cart.length;
    $("#checkout").style.opacity = cart.length ? 1 : .5;

    $("#cartItems").innerHTML = cart.length ? cart.map((i) => {
      const p = find(i.id);
      return `
        <div class="cart-item">
          <div class="cart-item__img" style="background:${CATEGORY[p.category].bg}">${thumb(p)}</div>
          <div>
            <h4>${p.name}</h4>
            <small>${money(p.price)} · ${p.sizes}</small>
            <div class="qty">
              <button data-dec="${p.id}" aria-label="Decrease">−</button>
              <span>${i.qty}</span>
              <button data-inc="${p.id}" aria-label="Increase">+</button>
            </div>
          </div>
          <button class="remove" data-rm="${p.id}">Remove</button>
        </div>`;
    }).join("") : `<p class="cart__empty">Your bag is empty 🧸<br>Add something cute!</p>`;
    save();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.id) {
      const id = +t.dataset.id;
      const item = cart.find((i) => i.id === id);
      item ? item.qty++ : cart.push({ id, qty: 1 });
      renderCart();
      toast("Added to your bag ✓");
    } else if (t.dataset.inc) {
      cart.find((i) => i.id === +t.dataset.inc).qty++;
      renderCart();
    } else if (t.dataset.dec) {
      const item = cart.find((i) => i.id === +t.dataset.dec);
      if (--item.qty <= 0) cart = cart.filter((i) => i !== item);
      renderCart();
    } else if (t.dataset.rm) {
      cart = cart.filter((i) => i.id !== +t.dataset.rm);
      renderCart();
    }
  });

  const openCart = () => document.body.classList.add("cart-open");
  const closeCart = () => document.body.classList.remove("cart-open");
  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);

  $("#checkout").addEventListener("click", () => {
    if (!cart.length) return;
    const lines = cart.map((i) => {
      const p = find(i.id);
      return `• ${p.name} x${i.qty} — ${money(p.price * i.qty)}`;
    });
    const total = cart.reduce((s, i) => s + find(i.id).price * i.qty, 0);
    const msg = `Hello ${SHOP.name}! I'd like to order:\n\n${lines.join("\n")}\n\nTotal: ${money(total)}\n\nSize(s): \nDelivery location: \nName: `;
    window.open(waLink(msg), "_blank");
  });

  // ---------- Contact form -> WhatsApp ----------
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    window.open(waLink(`Hello, my name is ${f.get("name")}.\n\n${f.get("message")}`), "_blank");
  });

  render("all");
  renderCart();
})();
