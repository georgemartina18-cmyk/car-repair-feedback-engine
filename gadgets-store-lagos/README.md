# Gadgets Store in Lagos: website

Online store for **Gadgets Store in Lagos**, 5 Otigba Street, Computer Village, Ikeja.

## What it's built with (in plain English)

| Tool | What it does |
|---|---|
| **Astro** | Builds the web pages. It sends very little code to the phone, so pages load fast even on slow data. |
| **Tailwind CSS** | The styling (colours, spacing, fonts). |
| **Supabase** | The database: products, orders, photos and the admin login. |
| **Paystack** | Card, bank transfer and USSD payments (added in Phase 3). |
| **Cloudflare Workers** | Free hosting. Puts the site on the internet. |

Until Supabase is connected, the site shows **sample products** so you can see the design.

## Where things live

| Folder / file | What's inside |
|---|---|
| `src/pages/` | One file per page (`index.astro` is the homepage). |
| `src/components/` | Reusable parts: header, footer, product card and so on. |
| `src/styles/global.css` | **Colours and fonts.** Change a colour here and it changes everywhere. |
| `src/components/Logo.astro` | The placeholder logo. Instructions for swapping in a real one are inside. |
| `src/config/defaults.ts` | Backup store details (phone, address). The live values are edited in Admin → Settings. |
| `src/data/samples.ts` | The sample products. |
| `supabase/schema.sql` | Creates the database tables and security rules. Run once. |
| `supabase/seed.sql` | Adds the sample products, categories and delivery fees. |
| `.env.example` | List of secret keys needed. Copy it to `.env` and fill it in. |

## Commands (for the developer)

```bash
npm install        # first time only: downloads the tools
npm run dev        # preview on your computer at http://localhost:4321
npm run build      # check that the site builds without errors
npm run check      # check for code mistakes
npm run samples    # rebuild sample images and supabase/seed.sql
```

To preview on your phone: run `npm run dev -- --host`, connect your phone to the
same Wi-Fi, and open the "Network" address it prints (for example `http://192.168.0.5:4321`).
