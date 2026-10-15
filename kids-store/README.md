# ABICEE KIDS Website: Beginner's Guide

This folder holds a complete, mobile-friendly online shop for a kids' clothing business in Ghana.
Customers browse products, add them to a bag, and either **place the order on the website** or send it to the shop's **WhatsApp** in one tap.
They pay with **Mobile Money**. You don't need a database, a server or any monthly fees to run it.

```
kids-store/
├── index.html          ← the web page
├── css/style.css       ← colours & design
├── js/config.js        ← ✏️ SHOP NAME, WHATSAPP NUMBER, SOCIAL LINKS
├── js/products.js      ← ✏️ PRODUCTS, PRICES, PHOTOS
├── js/app.js           ← site logic (no need to touch)
└── images/products/    ← 📷 put product photos here
```

> **Guides in this folder**
> - `SETUP-GOOGLE-SHEET.md`: connect the Google Sheet so the owner can add products from her
>   phone (Parts 1–7) and turn on ordering on the website (Part 8).
> - `OWNER-GUIDE.md`: a simple guide to give the owner.

---

## Step 1: Gather this from your client

| What | Example |
|---|---|
| Shop name (exactly as on TikTok) | "Little Treasures GH" |
| WhatsApp number for orders | 024 412 3456 |
| Email (optional) | shop@gmail.com |
| Location / area | East Legon, Accra |
| Opening hours | Mon–Sat 8am–7pm |
| TikTok / Instagram / Facebook links | |
| Logo (if she has one) | PNG file |
| 10–30 product photos + name, price, sizes | |
| Delivery areas, times and fees | |
| Payment options | MTN MoMo, Telecel Cash, cash on delivery |
| 3 real customer reviews (screenshots from TikTok/WhatsApp work) | |

**Photo tip:** square photos (same size for every product) on a plain, light background look the most professional. Phone photos are fine. You can also save frames from her TikTok videos.

---

## Step 2: Edit the content (no coding needed)

You only need a text editor. **VS Code** is free (https://code.visualstudio.com), or use Notepad.

1. **`js/config.js`**: change the name, WhatsApp number, phone, email, location and links.
   - The **delivery zones and fees** are in the same file (`DELIVERY`). The current fees are starting estimates with Accra as the base, so confirm them with the client.
   - WhatsApp number format: drop the first `0` and add `233` in front, with no spaces and no `+`.
     For example, `024 412 3456` becomes `233244123456`.
2. **`js/products.js`**: one line per product. Copy a line to add a product and delete a line to remove one.
   - `sizes` is the list customers choose from, e.g. `["2–3 yrs", "4–5 yrs"]`, or `["One size"]`.
   - The current pictures are temporary illustrations (`.svg` files). To use real photos, put the photo file in `images/products/` and write its name, for example `image: "images/products/pink-dress.jpg"`.
   - Keep photo file names lowercase with no spaces.
   - Shrink large photos first at https://squoosh.app (aim for under 200 KB each) so the site loads fast on mobile data.
3. **`index.html`**: replace the placeholder text:
   - the **"500+ happy parents / 16 regions / 4.9★"** numbers (use real numbers or delete them),
   - the **three reviews** under "What parents say" (use real customer words),
   - the **About us** paragraph (her real story),
   - the shop name in the `<title>` and `description` tags at the top.
   > ⚠️ Don't publish fake reviews or stats. Replace them with real ones before going live.
4. **Colours**: the top of `css/style.css` has `--primary` (pink) and `--accent` (yellow). Change them to match her brand.

**To preview:** double-click `index.html` and it opens in your browser. Refresh after each change.

---

## Step 3: Put it online (free hosting)

### Option A: Netlify Drop (easiest, about 5 minutes) ⭐ recommended for you
1. Go to https://app.netlify.com/signup and sign up free (with email or Google).
2. Go to https://app.netlify.com/drop
3. **Drag the whole `kids-store` folder** onto the page.
4. Done. You get a live link like `https://sparkly-unicorn-123.netlify.app`.
5. In **Site configuration → Change site name**, rename it, for example `littletreasuresgh.netlify.app`.
6. **To update later:** open the site in Netlify, go to **Deploys**, and drag the folder in again.

### Option B: GitHub Pages (free, good if you keep using GitHub)
1. Create a new GitHub repository, e.g. `littletreasures-website`, and upload the *contents* of this folder.
2. Open the repository's **Settings → Pages**, then under **Source** choose `main` branch, `/ (root)`, and click Save.
3. Your site will be at `https://<your-username>.github.io/littletreasures-website/`.

---

## Step 4: Get a proper domain name (recommended, about GH₵ 150–700 per year)

A custom domain such as `littletreasuresgh.com` looks far more professional than a free link.

| Domain | Where to buy | Approx. price |
|---|---|---|
| `.com` | Namecheap, Porkbun, Cloudflare | US$10–15 per year |
| `.com.gh` | Ghana registrars, e.g. Ghana Dot Com / Web4Africa / Ipage GH | about GH₵ 300–700 per year |

Then, in Netlify, go to **Domain management → Add a domain**, enter the domain, and follow the instructions.
Netlify shows you exactly which DNS records to copy into the registrar's website. Netlify also sets up the HTTPS padlock 🔒 for free.

*Prices change, so check the registrar's site.*

---

## Step 5: After launch

- **Google:** add the shop to **Google Business Profile** (https://business.google.com) with the website link. This is how people find "kids clothes near me".
- **TikTok/Instagram bio:** put the website link there.
- **WhatsApp Business app:** set up a catalogue and quick replies, and add the website link to the profile.
- **Updates:** for new stock, edit `products.js`, add the photos, and re-upload the folder.

---

## Later upgrades (when the business grows)

| Need | Solution |
|---|---|
| Customers pay on the website (MoMo/card) | **Paystack** (works in Ghana and supports MoMo). Add Paystack payment links per product or integrate checkout |
| She wants to add products herself from her phone | Move to **Shopify** (paid, about US$29/mo) or **WooCommerce**. This design can be recreated there |
| Stock tracking, order history | Same as above |

---

## Pricing your work (a rough guide)

In Ghana, a simple, professional shop site like this commonly sells for about **GH₵ 1,500–5,000**, plus an optional monthly fee
(e.g. GH₵ 150–400) for adding new products and updates. The domain is billed to the client separately.
Agree on the price, what is included and the number of revision rounds in writing **before** you start.
