/* =========================================================
   PRODUCTS — add, remove or edit items here.

   category must be one of:
     baby, girls, boys, shoes, accessories, essentials

   sizes: the options customers can choose from.
          Use ["One size"] if there is only one.

   image: put the photo in images/products/ and write its file name,
          e.g. "images/products/pink-dress.jpg".
          Leave it "" and a coloured placeholder is shown instead.

   badge (optional): "New", "Hot", "Sale" ...
   oldPrice (optional): shows a crossed-out price for sales.
   ========================================================= */
const PRODUCTS = [
  { id: 1,  name: "Floral Party Dress",        category: "girls",       price: 180, oldPrice: 220, badge: "Sale",
    sizes: ["2–3 yrs", "4–5 yrs", "6–7 yrs", "8 yrs"],          image: "images/products/floral-party-dress.svg" },
  { id: 2,  name: "Baby Romper Set (3 pcs)",   category: "baby",        price: 150, badge: "New",
    sizes: ["0–3 mths", "3–6 mths", "6–12 mths"],               image: "images/products/baby-romper-set.svg" },
  { id: 3,  name: "Boys Smart Shirt & Shorts", category: "boys",        price: 165,
    sizes: ["3–4 yrs", "5–6 yrs", "7–8 yrs", "9–10 yrs"],       image: "images/products/boys-shirt-shorts.svg" },
  { id: 4,  name: "Light-Up Sneakers",         category: "shoes",       price: 140, badge: "Hot",
    sizes: ["EU 22", "EU 24", "EU 26", "EU 28", "EU 30", "EU 32"], image: "images/products/light-up-sneakers.svg" },
  { id: 5,  name: "Hair Bow & Clip Set",       category: "accessories", price: 45,
    sizes: ["One size"],                                        image: "images/products/hair-bow-set.svg" },
  { id: 6,  name: "Newborn Gift Box",          category: "essentials",  price: 320, badge: "New",
    sizes: ["Girl (pink)", "Boy (blue)", "Unisex"],             image: "images/products/newborn-gift-box.svg" },
  { id: 7,  name: "Girls Denim Overall",       category: "girls",       price: 160,
    sizes: ["3–4 yrs", "5–6 yrs", "7–9 yrs"],                   image: "images/products/girls-denim-overall.svg" },
  { id: 8,  name: "Boys Ankara Kaftan",        category: "boys",        price: 190, badge: "Hot",
    sizes: ["2–4 yrs", "5–7 yrs", "8–10 yrs", "11–12 yrs"],     image: "images/products/boys-ankara-kaftan.svg" },
  { id: 9,  name: "Cotton Sleepsuit (2 pack)", category: "baby",        price: 110,
    sizes: ["0–3 mths", "3–6 mths", "6–12 mths", "12–18 mths"], image: "images/products/cotton-sleepsuit.svg" },
  { id: 10, name: "Kids School Backpack",      category: "accessories", price: 120, oldPrice: 150, badge: "Sale",
    sizes: ["One size"],                                        image: "images/products/school-backpack.svg" },
  { id: 11, name: "Soft Sole Baby Shoes",      category: "shoes",       price: 75,
    sizes: ["0–6 mths", "6–12 mths", "12–18 mths"],             image: "images/products/soft-sole-baby-shoes.svg" },
  { id: 12, name: "Feeding Bottle Set (3 pcs)", category: "essentials", price: 95,
    sizes: ["One size"],                                        image: "images/products/feeding-bottle-set.svg" },
];
