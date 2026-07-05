require('dotenv').config();
const mysql = require('mysql2/promise');
const redisClient = require('../config/redis');

const iconMapping = {
  // Baby Care
  "Baby Care": "👶",
  "Baby Bath & Skin": "🛁",
  "Diapers & Wipes": "🍼",
  "Baby Food": "🥣",
  "Baby Toys & Accessories": "🧸",

  // Beauty & Cosmetics
  "Beauty & Cosmetics": "💄",
  "Makeup": "💋",
  "Perfume & Body Spray": "🌸",
  "Hair Care": "💇",
  "Skin Care": "✨",
  "Grooming": "🪒",
  "Oral Care": "🪥",

  // Grocery & Food
  "Grocery & Food": "🛒",
  "Cooking Items": "🍚",
  "Snacks": "🍪",
  "Tea & Coffee": "☕",
  "Drinks": "🥤",
  "Dry Fruits, Nuts & Honey": "🥜",

  // Cleaning & Household
  "Cleaning & Household": "🧹",
  "Laundry": "🧺",
  "Cleaners": "🧴",
  "Tissue & Paper": "🧻",
  "Air Freshener & Insect Killer": "🌬️",

  // Home & Kitchen
  "Home & Kitchen": "🏠",
  "Cookware": "🍳",
  "Dinner Sets": "🍽️",
  "Kitchen Tools": "🔪",
  "Home Decor": "🛋️",
  "Bed & Bath": "🛏️",

  // Electronics & Gadgets
  "Electronics & Gadgets": "💻",
  "Mobiles & Tablets": "📱",
  "Smart Watches": "⌚",
  "Headphones & Speakers": "🎧",
  "Laptops & Computers": "💻",
  "Accessories": "🔌",
  "Kitchen Appliances": "🍚",
  "Home Appliances": "🏠",

  // Fashion & Clothes
  "Fashion & Clothes": "👕",
  "Men's Wear": "👔",
  "Women's Wear": "👗",
  "Kids' Wear": "🧒",
  "Shoes": "👟",
  "Bags & Wallets": "👜",
  "Jewellery": "💍",
  "Watches & Sunglasses": "⌚",

  // Books & Stationery
  "Books & Stationery": "📚",
  "Books": "📖",
  "Stationery": "✏️",
  "Office & Art Supplies": "🎨",

  // Medicine & Health
  "Medicine & Health": "💊",
  "OTC Medicine": "💊",
  "Vitamins & Supplements": "💪",
  "Medical Devices": "🩺",
  "First Aid & Hygiene": "🩹",

  // Gifts & Toys
  "Gifts & Toys": "🎁",
  "Toys": "🧸",
  "Gift Items & Cards": "🎁",
  "Party Supplies & Balloons": "🎉"
};

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  console.log("Connected to MySQL database...");
  
  try {
    const [rows] = await db.query("SELECT id, name_en FROM categories");
    console.log(`Found ${rows.length} categories in database.`);
    
    let updatedCount = 0;
    for (const row of rows) {
      const matchName = Object.keys(iconMapping).find(
        key => key.toLowerCase().trim() === row.name_en.toLowerCase().trim()
      );
      
      if (matchName) {
        const icon = iconMapping[matchName];
        await db.query("UPDATE categories SET icon = ? WHERE id = ?", [icon, row.id]);
        console.log(`Updated "${row.name_en}" -> ${icon}`);
        updatedCount++;
      } else {
        console.log(`No icon match for "${row.name_en}"`);
      }
    }
    
    console.log(`\nSuccessfully updated ${updatedCount} category icons!`);
    
    // Clear redis cache
    try {
      await redisClient.del('categories:/api/products/categories');
      await redisClient.del('home-sections:/api/products/home-sections');
      const keys = await redisClient.keys('products-list:*');
      if (keys.length > 0) await redisClient.del(keys);
      console.log("Cleared Redis Cache successfully.");
    } catch (e) {
      console.log("No Redis cache to clear or connection error:", e.message);
    }
  } catch (err) {
    console.error("Error during icon updates:", err);
  } finally {
    await db.end();
  }
}

main();
