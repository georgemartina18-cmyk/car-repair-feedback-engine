# Connect the website to a Google Sheet (one-time setup, about 20 minutes)

After this, the owner adds products from her phone with a Google Form, and they appear on
the website automatically. Nobody has to touch code or re-upload to Netlify again.

**You need:** a Google (Gmail) account. Use **the owner's** account, or a business Gmail you
will hand over to her, so that she owns her product list.

**Do it on a computer.** It's easier than on a phone.

---

## Part 1: Create the "Add product" form (8 min)

1. Go to **https://forms.google.com** and sign in with the shop's Gmail.
2. Click **Blank form** (the big **+**).
3. Click "Untitled form" and rename it **ABICEE KIDS – Add product**.
4. Create these questions. Click **⊕ Add question** on the right for each one.
   **Type the titles exactly as written**, because the website looks for these words.

| # | Question title | Type (dropdown on the right) | Settings |
|---|---|---|---|
| 1 | `Product name` | Short answer | Turn on **Required** |
| 2 | `Category` | Dropdown | Options: `Baby`, `Girls`, `Boys`, `Shoes`, `Accessories`, `Essentials`. **Required** |
| 3 | `Price (GH₵)` | Short answer | **Required**. Click **⋮ → Response validation → Number** |
| 4 | `Old price (optional, for sales)` | Short answer | not required |
| 5 | `Sizes (separate with commas)` | Short answer | not required. In the description write: *e.g. 2-3 yrs, 4-5 yrs, 6-7 yrs. Leave empty for One size* |
| 6 | `Badge` | Dropdown | Options: `None`, `New`, `Hot`, `Sale`. Not required |
| 7 | `Photo` | File upload | Click **Continue** on Google's notice. Turn on **Allow only specific file types → Image**, **Maximum number of files: 5**, **Maximum file size: 10 MB**. **Required** |
| 8 | `Colours (separate with commas)` | Short answer | not required. In the description write: *e.g. White, Black, Orange. Upload one photo per colour in the same order, or one photo showing all colours* |

5. **Optional, recommended:** add a security code so that only the owner can add products,
   even if someone gets hold of the form link:
   - Add question **9**: `Shop code`, type Short answer, **Required**.
   - Click **⋮ → Response validation → Regular expression → Matches** and type a secret
     word, e.g. `^abicee2468$` (keep the `^` and `$`).
   - In the "Custom error text" box type: *Wrong code*.

   The owner types `abicee2468` each time she adds a product. Choose your own word.

## Part 2: Connect the form to a Google Sheet (2 min)

1. At the top of the form, click the **Responses** tab.
2. Click **Link to Sheets** (green icon), choose **Create a new spreadsheet**, then click **Create**.
3. The new Sheet opens. In the first empty column **after `Photo`** (or after `Shop code`),
   click the top cell and type **`Status`**.
   This is where the owner later types `Sold out` or `Hide`.

## Part 3: Add one test product (2 min)

1. In the form, click the purple **Publish** button (top right) and confirm. Forms only
   accept submissions once they are published.
2. Click **Copy responder link** (or the 🔗 icon), open a new tab and paste the link.
   (Preview mode 👁 can't submit, so use the real link.)
3. Fill it in with any product and photo, then click **Submit**.
4. Check the Sheet: a new row should appear.
5. Keep the responder link safe. It's the link the owner will use to add products.

## Part 4: Make the photos viewable (2 min)

The form saves photos into a Google Drive folder that is private by default. The website
can't show private photos.

1. Go to **https://drive.google.com**.
2. Find the folder named **ABICEE KIDS – Add product (File responses)**.
3. Right-click it, choose **Share → Share**, and under **General access** change
   *Restricted* to **Anyone with the link** (Viewer). Click **Done**.

   All photos inside, including future ones, become viewable.

## Part 5: Publish the Sheet for the website (2 min)

1. In the Sheet, click **File → Share → Publish to web**.
2. In the first dropdown, change *Entire document* to **Form responses 1**.
3. In the second dropdown, change *Web page* to **Comma-separated values (.csv)**.
4. Click **Publish**, then **OK**.
5. **Copy the link** it shows. It starts with `https://docs.google.com/spreadsheets/d/e/...`
   and ends in `output=csv`.

   "Publish to web" only shares the product list (names, prices, photo links), which is
   shown on the website anyway. Nobody can edit the Sheet through this link.

## Part 6: Put the link into the website (3 min)

1. Open `js/config.js` with Notepad or VS Code.
2. Find `productsSheet: "",` and paste the link between the quotes:
   ```js
   productsSheet: "https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv",
   ```
3. Save the file.
4. Re-upload to Netlify one last time: open your site in Netlify, go to the **Deploys** tab,
   and drag the website folder onto the box that says *"Drag and drop your site output folder here"*.
5. Open the website. Your test product should show (within about 5 minutes).

   Or just send the link to Claude and it will update the files for you.
   (Parts 1–7 = products. Part 8 = website orders.)

## Part 7: Hand over to the owner

1. Delete the test row in the Sheet, or type `Hide` in its Status cell.
2. Send her the **form link**: in the form, click **Send**, then the 🔗 link tab, then **Copy**.
3. Give her `OWNER-GUIDE.md` (or read it to her), along with the shop code if you set one.

---

## Part 8: Turn on ordering on the website (10 min)

Customers can then tap **Place order** on the website. Each order is saved in an **Orders**
tab in this same Sheet, and the owner gets an **email** for every order. The **Order on
WhatsApp** button stays available too.

1. Open the products Google Sheet (from Part 2).
2. Click **Extensions → Apps Script**. A code editor opens in a new tab.
3. Delete everything in the editor, then **copy all of** `setup/orders-script.gs` and paste it in.
4. Click the 💾 **Save** icon, and name the project **ABICEE orders** if asked.
5. Click the blue **Deploy** button, then **New deployment**.
   - Click the ⚙️ next to "Select type" and choose **Web app**.
   - Description: `Website orders`
   - Execute as: **Me**
   - Who has access: **Anyone**. This lets customers' browsers send orders in. They
     can't read the Sheet.
   - Click **Deploy**.
6. Google asks for permission. Click **Authorize access** and choose the shop's Gmail.
   - If you see *"Google hasn't verified this app"*, click **Advanced**, then
     **Go to ABICEE orders (unsafe)**. This is normal for your own script.
   - Click **Allow**. The script needs this to add rows to the Sheet and send the order emails.
7. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.
   - To check it works, open that link in your browser. It should say
     *"ABICEE KIDS order system is running"*.
8. In `js/config.js`:
   ```js
   ordersEndpoint: "https://script.google.com/macros/s/AKfy.../exec",
   momo: { number: "024 123 4567", name: "Abigail ..." },   // her MoMo number & registered name
   ```
   Then re-upload the folder to Netlify (Deploys tab, drag and drop).
9. Test it: place an order on the website. Within seconds you should get an email, and a new
   row in the **Orders** tab.

**Important:** always call or WhatsApp the customer to confirm an order before sending it.
Check that the total matches the website prices and that payment has arrived in MoMo.

**If you change the script later:** go to **Deploy → Manage deployments → ✏️ Edit**, set
**Version: New version**, then **Deploy**. The URL stays the same.

---

### Good to know
- **Changes take about 5 minutes to show.** Google refreshes published Sheets every few minutes.
- **Once the Sheet is connected, only its products are shown.** The samples in
  `js/products.js` are no longer used. If the Sheet is empty or can't be reached, customers
  see a short note inviting them to message the shop on WhatsApp.
- **You can add new form questions later.** It's fine if columns move around, because the
  website finds columns by their titles.
