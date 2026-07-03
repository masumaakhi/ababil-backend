require('dotenv').config();
const mysql = require('mysql2/promise');

const categoriesData = [
  {
    name_en: "Grocery", icon: "🛒", sort_order: 1,
    subs: [
      {
        name_en: "Food Staples",
        subs: ["Rice, Flour & Atta", "Dal & Pulses", "Oil & Ghee", "Salt, Sugar & Sweeteners", "Spices"]
      },
      {
        name_en: "Snacks & Beverages",
        subs: ["Snacks", "Biscuits", "Chocolates & Candy", "Tea & Coffee", "Beverages", "Breakfast"]
      },
      {
        name_en: "Specialty Foods",
        subs: ["Frozen Food", "Canned Food", "Organic Food", "Dry Fruits & Nuts", "Honey", "Pickles & Sauces", "Baking"]
      }
    ]
  },
  {
    name_en: "Home Care & Cleaning", icon: "🧹", sort_order: 2,
    subs: [
      {
        name_en: "Cleaning Supplies",
        subs: ["Dishwashing", "Laundry Care", "Toilet Cleaner", "Kitchen Cleaning", "Cleaning Tools"]
      },
      {
        name_en: "Household Essentials",
        subs: ["Air Freshener", "Insect Killer", "Garbage Bags", "Tissue & Paper"]
      }
    ]
  },
  {
    name_en: "Beauty & Personal Care", icon: "💄", sort_order: 3,
    subs: [
      {
        name_en: "Skin & Face",
        subs: ["Skin Care", "Face Care"]
      },
      {
        name_en: "Hair & Body",
        subs: ["Hair Care", "Body Care", "Hand Wash", "Soap"]
      },
      {
        name_en: "Cosmetics & Fragrance",
        subs: ["Makeup", "Perfume"]
      },
      {
        name_en: "Personal Grooming",
        subs: ["Men's Grooming", "Oral Care", "Feminine Care"]
      }
    ]
  },
  {
    name_en: "Baby Care", icon: "👶", sort_order: 4,
    subs: [
      {
        name_en: "Baby Food & Feeding",
        subs: ["Baby Food", "Baby Milk", "Feeding"]
      },
      {
        name_en: "Diapering & Bath",
        subs: ["Diapers", "Baby Bath", "Baby Wipes"]
      },
      {
        name_en: "Baby Essentials",
        subs: ["Baby Skin Care", "Baby Accessories", "Baby Toys"]
      }
    ]
  },
  {
    name_en: "Health Care", icon: "💊", sort_order: 5,
    subs: [
      {
        name_en: "Medicines & First Aid",
        subs: ["Medicine", "First Aid"]
      },
      {
        name_en: "Wellness & Supplements",
        subs: ["Vitamins", "Health Drinks"]
      },
      {
        name_en: "Medical Supplies",
        subs: ["Medical Devices", "Masks", "Sanitizer", "BP Machine", "Thermometer", "Diabetic Care"]
      }
    ]
  },
  {
    name_en: "Books & Stationery", icon: "📚", sort_order: 6,
    subs: [
      {
        name_en: "Stationery",
        subs: ["Notebook", "Pen", "Pencil", "Marker", "Printer Paper"]
      },
      {
        name_en: "Art & Office",
        subs: ["Office Supplies", "Art Supplies", "Calculator"]
      },
      {
        name_en: "School Supplies",
        subs: ["Books", "School Bags"]
      }
    ]
  },
  {
    name_en: "Home & Lifestyle", icon: "🏠", sort_order: 7,
    subs: [
      {
        name_en: "Home Decor",
        subs: ["Furniture", "Lighting", "Curtains", "Clocks", "Plants"]
      },
      {
        name_en: "Home Essentials",
        subs: ["Storage", "Bathroom", "Bedroom", "Mats"]
      }
    ]
  },
  {
    name_en: "Fashion", icon: "👕", sort_order: 8,
    subs: [
      {
        name_en: "Clothing",
        subs: ["Men", "Women", "Kids"]
      },
      {
        name_en: "Accessories",
        subs: ["Shoes", "Bags", "Watches", "Jewellery", "Sunglasses", "Wallet"]
      }
    ]
  },
  {
    name_en: "Electronics & Appliances", icon: "💻", sort_order: 9,
    subs: [
      {
        name_en: "Large Appliances",
        subs: ["TV", "Refrigerator", "Air Conditioner"]
      },
      {
        name_en: "Small Appliances",
        subs: ["Fan", "Rice Cooker", "Iron", "Blender", "Mixer", "Microwave", "Electric Kettle"]
      }
    ]
  },
  {
    name_en: "Mobile & Gadgets", icon: "📱", sort_order: 10,
    subs: [
      {
        name_en: "Devices",
        subs: ["Mobile Phone", "Tablet", "Smart Watch"]
      },
      {
        name_en: "Accessories",
        subs: ["Power Bank", "Earbuds", "Headphones", "Charger", "Cable", "Phone Case", "Memory Card"]
      }
    ]
  },
  {
    name_en: "Gifts & Toys", icon: "🎁", sort_order: 11,
    subs: [
      {
        name_en: "Gifts",
        subs: ["Gift Items", "Party Supplies"]
      },
      {
        name_en: "Toys",
        subs: ["Educational Toys", "Soft Toys", "Action Figures"]
      }
    ]
  }
];

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + Math.floor(Math.random() * 1000);
}

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  console.log("Truncating categories table...");
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  await db.query('TRUNCATE TABLE categories');
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  
  for (const mainCat of categoriesData) {
    console.log(`Inserting ${mainCat.name_en}...`);
    const [mainResult] = await db.query(
      'INSERT INTO categories (name_en, slug, icon, sort_order, parent_id) VALUES (?, ?, ?, ?, NULL)',
      [mainCat.name_en, generateSlug(mainCat.name_en), mainCat.icon, mainCat.sort_order]
    );
    const mainId = mainResult.insertId;
    
    for (let i = 0; i < mainCat.subs.length; i++) {
      const subCat = mainCat.subs[i];
      const [subResult] = await db.query(
        'INSERT INTO categories (name_en, slug, sort_order, parent_id) VALUES (?, ?, ?, ?)',
        [subCat.name_en, generateSlug(subCat.name_en), i + 1, mainId]
      );
      const subId = subResult.insertId;
      
      for (let j = 0; j < subCat.subs.length; j++) {
        const subSubCatName = subCat.subs[j];
        await db.query(
          'INSERT INTO categories (name_en, slug, sort_order, parent_id) VALUES (?, ?, ?, ?)',
          [subSubCatName, generateSlug(subSubCatName), j + 1, subId]
        );
      }
    }
  }
  
  console.log("Database seeded successfully!");
  process.exit();
}

main();
