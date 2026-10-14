/* =========================================================
   PRODUCTS — add, remove or edit items here.

   category must be one of:
     baby, girls, boys, shoes, accessories, essentials

   image: put the photo in images/products/ and write its file name,
          e.g. "images/products/pink-dress.jpg".
          Leave it "" and a coloured placeholder is shown instead.

   badge (optional): "New", "Hot", "Sale" ...
   oldPrice (optional): shows a crossed-out price for sales.
   ========================================================= */
const PRODUCTS = [
  { id: 1,  name: "Floral Party Dress",        category: "girls",       price: 180, oldPrice: 220, sizes: "2–8 yrs",   image: "", badge: "Sale" },
  { id: 2,  name: "Baby Romper Set (3 pcs)",   category: "baby",        price: 150,               sizes: "0–12 mths", image: "", badge: "New" },
  { id: 3,  name: "Boys Smart Shirt & Shorts", category: "boys",        price: 165,               sizes: "3–10 yrs",  image: "" },
  { id: 4,  name: "Light-Up Sneakers",         category: "shoes",       price: 140,               sizes: "EU 22–33",  image: "", badge: "Hot" },
  { id: 5,  name: "Hair Bow & Clip Set",       category: "accessories", price: 45,                sizes: "One size",  image: "" },
  { id: 6,  name: "Newborn Gift Box",          category: "essentials",  price: 320,               sizes: "0–3 mths",  image: "", badge: "New" },
  { id: 7,  name: "Girls Denim Overall",       category: "girls",       price: 160,               sizes: "3–9 yrs",   image: "" },
  { id: 8,  name: "Boys Ankara Kaftan",        category: "boys",        price: 190,               sizes: "2–12 yrs",  image: "", badge: "Hot" },
  { id: 9,  name: "Cotton Sleepsuit (2 pack)", category: "baby",        price: 110,               sizes: "0–18 mths", image: "" },
  { id: 10, name: "Kids School Backpack",      category: "accessories", price: 120, oldPrice: 150, sizes: "One size", image: "", badge: "Sale" },
  { id: 11, name: "Soft Sole Baby Shoes",      category: "shoes",       price: 75,                sizes: "0–18 mths", image: "" },
  { id: 12, name: "Feeding Bottle Set",        category: "essentials",  price: 95,                sizes: "—",         image: "" },
];
