/* =========================================================
   SHOP SETTINGS — edit these values, nothing else needed.
   ========================================================= */
const SHOP = {
  name: "ABICEE KIDS",
  tagline: "Everything your little one needs — clothes, shoes, accessories & essentials, from newborn to 12 years.",

  // WhatsApp number in international format, digits only (no +, no spaces).
  // Example: 0244123456 in Ghana becomes 233244123456
  whatsapp: "2348105149828",

  phoneDisplay: "+234 810 514 9828",
  email: "",                       // leave "" to hide
  location: "Accra, Ghana",
  hours: "Mon – Sat: 8:00am – 7:00pm",

  socials: {
    tiktok: "https://www.tiktok.com/t/ZPLSHTkVr",
    instagram: "",
    facebook: "",
  },

  currency: "GH₵",

  // Google Sheet product list (published as CSV). Leave "" to use js/products.js.
  // How to get this link: see README.md, "Let the owner add products".
  productsSheet: "",
};

/* =========================================================
   DELIVERY ZONES (base: Accra). Fees are in GH₵.
   Customers pick their zone in the bag and the fee is added
   to the order total automatically. Edit freely.
   ========================================================= */
const DELIVERY = [
  { id: "accra",   zone: "Accra (central)",            eta: "Same / next day", fee: 30,
    towns: "Osu, Labone, Airport, East Legon, Madina, Achimota, Lapaz, Dansoman, Spintex, Haatso, Dzorwulu" },
  { id: "greater", zone: "Greater Accra (outskirts)",  eta: "Next day",        fee: 40,
    towns: "Tema, Ashaiman, Kasoa, Adenta, Oyarifa, Dodowa, Amasaman, Pokuase, Weija, Kpone, Prampram" },
  { id: "near",    zone: "Eastern & Central",          eta: "1 – 2 days",      fee: 50,
    towns: "Aburi, Nsawam, Koforidua, Nkawkaw, Akosombo, Winneba, Cape Coast, Mankessim, Swedru" },
  { id: "mid",     zone: "Ashanti, Western & Volta",   eta: "1 – 2 days",      fee: 60,
    towns: "Kumasi, Obuasi, Ejisu, Takoradi, Tarkwa, Ho, Hohoe, Aflao, Keta" },
  { id: "far",     zone: "Bono, Bono East, Ahafo, Oti & Western North", eta: "2 – 3 days", fee: 70,
    towns: "Sunyani, Techiman, Kintampo, Goaso, Dambai, Sefwi Wiawso" },
  { id: "north",   zone: "Northern regions",           eta: "2 – 4 days",      fee: 80,
    towns: "Tamale, Yendi, Damongo, Nalerigu, Bolgatanga, Bawku, Wa" },
];
