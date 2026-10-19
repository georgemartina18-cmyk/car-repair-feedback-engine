# Launch day & handover: Cloudflare Pages + domain

This is the plan for moving ABICEE KIDS from the test setup (Netlify plus your personal Google
account) to its permanent home, owned by Mama C:

- **Hosting:** Cloudflare Pages (free, with no visitor or bandwidth limit for a site like this)
- **Domain:** e.g. `abiceekids.com`, bought from Cloudflare (~US$10–11/year, sold at cost)
- **Products & orders:** her own Google Form, Sheet and order script

Allow about **1.5 hours** in total. Do it **after the first 50% payment**. Cloudflare's menus
change from time to time, so if a button has a slightly different name, look for the closest
match or send Claude a screenshot.

---

## Step 0: Create one business email for the shop (5 min)

Create a new Gmail account, e.g. **abiceekids@gmail.com** (or the closest available name).
Use this one account for **everything** below: Google Form/Sheet, Cloudflare and the domain.

At handover you give Mama C the email and password, and she changes the password. She then
owns everything at once, with no transfers needed.

> Keep the password somewhere safe until handover.

---

## Step 1: Set up products & orders in the business Google account (30 min)

Sign in to the new Gmail and follow **`SETUP-GOOGLE-SHEET.md`, Parts 1–8** again, exactly as
you did the first time. Use the latest `setup/orders-script.gs` from this folder (it includes
the fix that keeps orders working on very busy days).

At the end you'll have **two new links**:
1. the **Sheet link** ending in `output=csv` (Part 5)
2. the **order link** ending in `/exec` (Part 8)

Also keep the new **form responder link**. That's what Mama C uses to add products.

**Send both links to Claude**, together with Mama C's details:
- her **Ghana WhatsApp number**
- her **MoMo number and registered name**
- her **reviews**, **About us** story and confirmed **delivery fees**

Claude will send you the final website ZIP with everything filled in.

---

## Step 2: Put the website on Cloudflare Pages (15 min)

1. Go to **https://dash.cloudflare.com/sign-up** and sign up with the **business Gmail**.
   Verify the email.
2. In the left menu, open **Compute (Workers) → Workers & Pages** (it may just say
   **Workers & Pages**).
3. Click **Create** (or **Create application**), choose the **Pages** tab, then
   **Upload assets** / **Use direct upload**.
4. Project name: **abiceekids**. Click **Create project**.
5. Drag in the **unzipped website folder** from Claude's final ZIP (or click to select it),
   then click **Deploy site**.
6. Wait for "Success". Your site is now live at **https://abiceekids.pages.dev**.
7. Open that link on your phone using mobile data, and check that products load and a test
   order works.

**To update the site later:** open the project, click **Create deployment** (or **Upload new
version**), and drag in the new folder.

---

## Step 3: Buy the domain (10 min)

1. In Cloudflare's left menu, open **Domain Registration → Register Domains**.
2. Search for **abiceekids.com** (or the name Mama C chose). If it's taken, try options like
   `abiceekidsgh.com` or `abiceekids.shop`.
3. Add it to the cart, fill in the contact details **in Mama C's name**, and pay with a bank
   card.
4. Turn **Auto-renew ON** so the domain never expires by accident.

> **If Cloudflare doesn't accept your card:** buy the domain at **Namecheap** or
> **Porkbun** instead. Then, in Cloudflare, use **Add a domain**, follow the steps, and copy the
> two Cloudflare **nameservers** into the domain seller's "Nameservers" setting. Ask Claude for
> help with this.

---

## Step 4: Connect the domain to the website (5 min, plus up to a few hours to take effect)

1. Go to **Workers & Pages → abiceekids → Custom domains → Set up a custom domain**.
2. Type **abiceekids.com** and click **Continue → Activate domain**.
3. Repeat for **www.abiceekids.com**.
4. Cloudflare sets everything up and adds the 🔒 padlock automatically. It usually takes a few
   minutes, but can take up to a few hours.
5. Open **https://abiceekids.com** on your phone. 🎉

---

## Step 5: Final checks (10 min)

On your phone, using mobile data:
- [ ] `abiceekids.com` opens with the 🔒 padlock
- [ ] Products from her Google Sheet show, with photos
- [ ] Add a product through her form, and it appears within about 5 minutes
- [ ] **Place order** works: thank-you screen, email to the business Gmail, and a row in the
      Orders tab
- [ ] The WhatsApp buttons open a chat with **her** number
- [ ] The MoMo details on the thank-you screen are hers
- [ ] Delete your test orders and the test product (or type `Hide` in its Status cell)

---

## Step 6: Handover to Mama C (20 min, ideally on a call)

1. Give her the **business Gmail address and password**, and have her **change the password**
   and add her phone number for recovery.
2. Give her the **form link**, and help her add it to her phone's home screen.
3. Walk her through **`OWNER-GUIDE.md`**: adding products, Sold out/Hide, and handling orders.
4. Show her the **Orders** tab and the order emails.
5. Tell her about the yearly **domain renewal** (auto-renew is on; the card needs to stay valid).
6. Collect the **second 50% payment**.

**If you're offering monthly support:** ask her to add your email as a member of her Cloudflare
account (**Manage account → Members → Invite**), so you can upload updates without her password.

---

## Step 7: Tidy up the test setup

Once `abiceekids.com` works on Cloudflare:
- **Netlify:** delete the old abiceekids project (Project configuration → Danger zone → Delete
  project), or leave it. It doesn't affect the new site.
- **Your personal Google account:** you can delete the old test form, Sheet and Apps Script.

---

### What it costs Mama C each year
| Item | Cost |
|---|---|
| Cloudflare Pages hosting | Free |
| Google Form, Sheet & order script | Free |
| Domain renewal | ~US$10–11 / year (about GH₵ 150–250) |
