/**
 * ABICEE KIDS — receives website orders.
 * Paste this into the product Google Sheet: Extensions → Apps Script.
 * Each order is added to an "Orders" tab and emailed to the owner.
 * Full steps: SETUP-GOOGLE-SHEET.md, Part 8.
 */

// Where order emails go. Leave "" to use the Google account that owns this Sheet.
const OWNER_EMAIL = "";

const HEADERS = ["Order ID", "Date", "Status", "Name", "Phone", "Delivery zone", "Location",
  "Items", "Subtotal (GH₵)", "Delivery (GH₵)", "Total (GH₵)", "Payment", "Note"];

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.website) return reply({ ok: true }); // spam trap field, real customers never fill it
    if (!d.name || !d.phone || !Array.isArray(d.items) || !d.items.length) {
      return reply({ ok: false, error: "Missing details" });
    }

    const clip = (v, n) => String(v == null ? "" : v).slice(0, n || 300);
    const money = (v) => Number(v) || 0;
    const items = d.items.slice(0, 50)
      .map((i) => `${clip(i.name, 120)} (${clip(i.size, 40)}) x${money(i.qty) || 1} = GH₵ ${money(i.lineTotal)}`)
      .join("\n");
    const id = clip(d.orderId, 20);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName("Orders");
      if (!sheet) {
        sheet = ss.insertSheet("Orders");
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
      }
      sheet.appendRow([id, new Date(), "New", clip(d.name, 100), "'" + clip(d.phone, 30),
        clip(d.zone, 100), clip(d.area), items, money(d.subtotal), money(d.delivery),
        money(d.total), clip(d.payment, 60), clip(d.note, 500)]);
    } finally {
      lock.releaseLock();
    }

    MailApp.sendEmail({
      to: OWNER_EMAIL || Session.getEffectiveUser().getEmail(),
      subject: `🛍️ New order ${id} — GH₵ ${money(d.total)} from ${clip(d.name, 60)}`,
      body: [
        `Order: ${id}`,
        `Customer: ${clip(d.name, 100)}`,
        `Phone / WhatsApp: ${clip(d.phone, 30)}`,
        `Delivery: ${clip(d.zone, 100)} — ${clip(d.area)}`,
        `Payment: ${clip(d.payment, 60)}`,
        d.note ? `Note: ${clip(d.note, 500)}` : "",
        "",
        items,
        "",
        `Subtotal: GH₵ ${money(d.subtotal)}`,
        `Delivery: GH₵ ${money(d.delivery)}`,
        `TOTAL: GH₵ ${money(d.total)}`,
        "",
        "Call or WhatsApp the customer to confirm stock and payment.",
        "All orders: open your Google Sheet → Orders tab.",
      ].filter((l) => l !== null).join("\n"),
    });

    return reply({ ok: true, orderId: id });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

// Opening the web app link in a browser shows this — handy to check it's live.
function doGet() {
  return reply({ ok: true, message: "ABICEE KIDS order system is running" });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
