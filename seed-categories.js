const mysql = require('mysql2/promise');
require('dotenv').config();

const CATEGORIES_TREE = [
  {
    id: "home-kitchen",
    nameEn: "Home & Kitchen",
    nameBn: "গৃহস্থালী সামগ্রী ও রান্নাঘর",
    icon: "🏠",
    subs: [
      {
        nameEn: "Home Appliances",
        nameBn: "হোম অ্যাপ্লায়েন্স",
        items: [
          { nameEn: "Blenders & Juicers", nameBn: "ব্লেন্ডার ও জুসার" },
          { nameEn: "Rice Cookers", nameBn: "রাইস কুকার" },
          { nameEn: "Irons & Steamers", nameBn: "ইস্ত্রি ও স্টিমার" },
          { nameEn: "Water Purifiers", nameBn: "ওয়াটার পিউরিফায়ার" }
        ]
      },
      {
        nameEn: "Home Decor",
        nameBn: "গৃহ সজ্জা",
        items: [
          { nameEn: "Wall Clocks", nameBn: "দেয়াল ঘড়ি" },
          { nameEn: "Showpieces", nameBn: "শোপিস" },
          { nameEn: "Rugs & Carpets", nameBn: "গালিচা ও কার্পেট" },
          { nameEn: "Curtains", nameBn: "পর্দা" }
        ]
      },
      {
        nameEn: "Kitchen Tools",
        nameBn: "রান্নাঘরের সরঞ্জাম",
        items: [
          { nameEn: "Knives & Choppers", nameBn: "ছুরি ও চপার" },
          { nameEn: "Kitchen Scales", nameBn: "রান্নাঘরের স্কেল" },
          { nameEn: "Storage Containers", nameBn: "স্টোরেজ কন্টেইনার" },
          { nameEn: "Gas Stoves", nameBn: "গ্যাসের চুলা" }
        ]
      }
    ]
  },
  {
    id: "crockeries",
    nameEn: "Crockeries",
    nameBn: "ক্রোকারিজ",
    icon: "🍽️",
    subs: [
      {
        nameEn: "Dinner Sets",
        nameBn: "ডিনার সেট",
        items: [
          { nameEn: "Ceramic Sets", nameBn: "সিরামিক সেট" },
          { nameEn: "Melamine Sets", nameBn: "মেলামাইন সেট" },
          { nameEn: "Glass Sets", nameBn: "গ্লাস সেট" }
        ]
      },
      {
        nameEn: "Cookware",
        nameBn: "কুকওয়্যার",
        items: [
          { nameEn: "Frying Pans", nameBn: "ফ্রাই প্যান" },
          { nameEn: "Saucepans", nameBn: "সসপ্যান" },
          { nameEn: "Pressure Cookers", nameBn: "প্রেসার কুকার" }
        ]
      },
      {
        nameEn: "Drinkware",
        nameBn: "ড্রিংকওয়্যার",
        items: [
          { nameEn: "Water Glasses", nameBn: "পানির গ্লাস" },
          { nameEn: "Mugs & Cups", nameBn: "মগ ও কাপ" },
          { nameEn: "Jugs & Pitchers", nameBn: "জগ ও পিচার" }
        ]
      }
    ]
  },
  {
    id: "cosmetics",
    nameEn: "Cosmetics",
    nameBn: "কসমেটিকস্",
    icon: "💄",
    subs: [
      {
        nameEn: "Makeup",
        nameBn: "মেকআপ",
        items: [
          { nameEn: "Face Makeup", nameBn: "ফেস মেকআপ" },
          { nameEn: "Eye Makeup", nameBn: "চোখের মেকআপ" },
          { nameEn: "Lips", nameBn: "লিপস্টিক" },
          { nameEn: "Makeup Brushes", nameBn: "মেকআপ ব্রাশ" }
        ]
      },
      {
        nameEn: "Skincare",
        nameBn: "ত্বকের যত্ন",
        items: [
          { nameEn: "Face Wash & Cleansers", nameBn: "ফেস ওয়াশ ও ক্লিনজার" },
          { nameEn: "Moisturizers & Creams", nameBn: "ময়েশ্চারাইজার ও ক্রিম" },
          { nameEn: "Sunscreen", nameBn: "সানস্ক্রিন" },
          { nameEn: "Serums & Essences", nameBn: "সিরাম ও এসেন্স" }
        ]
      },
      {
        nameEn: "Fragrances",
        nameBn: "সুগন্ধি",
        items: [
          { nameEn: "Perfumes (Women)", nameBn: "পারফিউম (মহিলা)" },
          { nameEn: "Colognes (Men)", nameBn: "কোলোন (পুরুষ)" },
          { nameEn: "Body Sprays", nameBn: "বডি স্প্রে" }
        ]
      }
    ]
  },
  {
    id: "baby-care",
    nameEn: "Baby Care",
    nameBn: "বেবি কেয়ার",
    icon: "👶",
    subs: [
      {
        nameEn: "Diapering & Potty",
        nameBn: "ডায়াপার ও পটি",
        items: [
          { nameEn: "Disposable Diapers", nameBn: "ডিসপোজেবল ডায়াপার" },
          { nameEn: "Baby Wipes", nameBn: "বেবি ওয়াইপস" },
          { nameEn: "Diaper Creams", nameBn: "ডায়াপার ক্রিম" }
        ]
      },
      {
        nameEn: "Baby Food",
        nameBn: "শিশুর খাদ্য",
        items: [
          { nameEn: "Formula Milk", nameBn: "ফর্মুলা দুধ" },
          { nameEn: "Baby Cereals", nameBn: "শিশুর সিরিয়াল" },
          { nameEn: "Baby Snacks", nameBn: "শিশুর স্ন্যাক্স" }
        ]
      },
      {
        nameEn: "Baby Bath & Skin",
        nameBn: "শিশুর গোসল ও ত্বক",
        items: [
          { nameEn: "Baby Wash & Soap", nameBn: "বেবি ওয়াশ ও সাবান" },
          { nameEn: "Baby Lotions", nameBn: "বেবি লোশন" },
          { nameEn: "Baby Powders", nameBn: "বেবি পাউডার" }
        ]
      }
    ]
  },
  {
    id: "library-crafts",
    nameEn: "Library & Crafts",
    nameBn: "লাইব্রেরি ও ক্রাফটস্",
    icon: "📚",
    subs: [
      {
        nameEn: "Books",
        nameBn: "বই",
        items: [
          { nameEn: "Fiction", nameBn: "ফিকশন" },
          { nameEn: "Non-Fiction", nameBn: "নন-ফিকশন" },
          { nameEn: "Children's Books", nameBn: "শিশুদের বই" },
          { nameEn: "Educational", nameBn: "শিক্ষামূলক" }
        ]
      },
      {
        nameEn: "Stationery",
        nameBn: "স্টেশনারি",
        items: [
          { nameEn: "Pens & Pencils", nameBn: "কলম ও পেন্সিল" },
          { nameEn: "Notebooks & Diaries", nameBn: "নোটবুক ও ডায়েরি" },
          { nameEn: "Office Supplies", nameBn: "অফিস সাপ্লাই" }
        ]
      },
      {
        nameEn: "Arts & Crafts",
        nameBn: "আর্টস অ্যান্ড ক্রাফটস",
        items: [
          { nameEn: "Paints & Brushes", nameBn: "রং ও ব্রাশ" },
          { nameEn: "Craft Papers", nameBn: "ক্রাফট পেপার" },
          { nameEn: "DIY Kits", nameBn: "ডিআইওয়াই কিট" }
        ]
      }
    ]
  },
  {
    id: "medicine",
    nameEn: "Medicine Corner",
    nameBn: "মেডিসিন কর্নার",
    icon: "💊",
    subs: [
      {
        nameEn: "Over The Counter (OTC)",
        nameBn: "ওটিসি মেডিসিন",
        items: [
          { nameEn: "Pain Relievers", nameBn: "পেইন কিলার" },
          { nameEn: "Cold & Cough", nameBn: "ঠান্ডা ও কাশির ওষুধ" },
          { nameEn: "Antacids", nameBn: "গ্যাস্ট্রিকের ওষুধ" }
        ]
      },
      {
        nameEn: "Vitamins & Supplements",
        nameBn: "ভিটামিন ও সাপ্লিমেন্ট",
        items: [
          { nameEn: "Multivitamins", nameBn: "মাল্টিভিটামিন" },
          { nameEn: "Vitamin C & Zinc", nameBn: "ভিটামিন সি ও জিংক" },
          { nameEn: "Calcium & Bone Health", nameBn: "ক্যালসিয়াম" }
        ]
      },
      {
        nameEn: "First Aid & Devices",
        nameBn: "ফার্স্ট এইড ও ডিভাইস",
        items: [
          { nameEn: "Bandages & Antiseptics", nameBn: "ব্যান্ডেজ ও অ্যান্টিসেপটিক" },
          { nameEn: "Thermometers", nameBn: "থার্মোমিটার" },
          { nameEn: "Blood Pressure Monitors", nameBn: "ব্লাড প্রেশার মনিটর" }
        ]
      }
    ]
  },
  {
    id: "gifts-toys",
    nameEn: "Gifts & Toys",
    nameBn: "গিফটস্ ও খেলনা",
    icon: "🎁",
    subs: [
      {
        nameEn: "Toys & Games",
        nameBn: "খেলনা ও গেমস",
        items: [
          { nameEn: "Action Figures", nameBn: "অ্যাকশন ফিগার" },
          { nameEn: "Board Games", nameBn: "বোর্ড গেম" },
          { nameEn: "Educational Toys", nameBn: "শিক্ষামূলক খেলনা" },
          { nameEn: "Soft Toys", nameBn: "নরম খেলনা" }
        ]
      },
      {
        nameEn: "Gift Items",
        nameBn: "গিফট আইটেম",
        items: [
          { nameEn: "Gift Sets", nameBn: "গিফট সেট" },
          { nameEn: "Greeting Cards", nameBn: "গ্রিটিং কার্ড" },
          { nameEn: "Mugs & Frames", nameBn: "মগ ও ফ্রেম" }
        ]
      },
      {
        nameEn: "Party Supplies",
        nameBn: "পার্টি সাপ্লাই",
        items: [
          { nameEn: "Balloons & Decorations", nameBn: "বেলুন ও সাজসজ্জা" },
          { nameEn: "Candles", nameBn: "মোমবাতি" }
        ]
      }
    ]
  },
  {
    id: "jewellery-fashion",
    nameEn: "Jewellery & Fashion",
    nameBn: "জুয়েলারি ও ফ্যাশন",
    icon: "💍",
    subs: [
      {
        nameEn: "Women's Fashion",
        nameBn: "মহিলাদের ফ্যাশন",
        items: [
          { nameEn: "Sarees & Salwar Kameez", nameBn: "শাড়ি ও সালোয়ার কামিজ" },
          { nameEn: "Tops & Tunics", nameBn: "টপস ও টিউনিক" },
          { nameEn: "Innerwear", nameBn: "ইনারওয়্যার" }
        ]
      },
      {
        nameEn: "Men's Fashion",
        nameBn: "পুরুষদের ফ্যাশন",
        items: [
          { nameEn: "Shirts & T-Shirts", nameBn: "শার্ট ও টি-শার্ট" },
          { nameEn: "Pants & Jeans", nameBn: "প্যান্ট ও জিন্স" },
          { nameEn: "Activewear", nameBn: "অ্যাক্টিভওয়্যার" }
        ]
      },
      {
        nameEn: "Jewellery",
        nameBn: "জুয়েলারি",
        items: [
          { nameEn: "Earrings", nameBn: "কানের দুল" },
          { nameEn: "Necklaces & Pendants", nameBn: "নেকলেস ও দুল" },
          { nameEn: "Rings & Bracelets", nameBn: "আংটি ও ব্রেসলেট" }
        ]
      }
    ]
  },
  {
    id: "leather-goods",
    nameEn: "Leather Goods",
    nameBn: "লেদার পণ্য",
    icon: "👜",
    subs: [
      {
        nameEn: "Bags & Purses",
        nameBn: "ব্যাগ ও পার্স",
        items: [
          { nameEn: "Ladies Handbags", nameBn: "মহিলাদের হ্যান্ডব্যাগ" },
          { nameEn: "Backpacks", nameBn: "ব্যাকপ্যাক" },
          { nameEn: "Wallets (Men & Women)", nameBn: "মানিব্যাগ" }
        ]
      },
      {
        nameEn: "Footwear",
        nameBn: "জুতো",
        items: [
          { nameEn: "Formal Shoes (Men)", nameBn: "ফরমাল জুতো (পুরুষ)" },
          { nameEn: "Casual Shoes", nameBn: "ক্যাজুয়াল জুতো" },
          { nameEn: "Sandals & Slippers", nameBn: "স্যান্ডেল ও স্লিপার" }
        ]
      },
      {
        nameEn: "Accessories",
        nameBn: "আনুষাঙ্গিক",
        items: [
          { nameEn: "Leather Belts", nameBn: "চামড়ার বেল্ট" },
          { nameEn: "Leather Jackets", nameBn: "লেদার জ্যাকেট" }
        ]
      }
    ]
  },
  {
    id: "electronics",
    nameEn: "Electronics & Gadgets",
    nameBn: "ইলেকট্রনিক্স ও গ্যাজেট",
    icon: "💻",
    subs: [
      {
        nameEn: "Smartphones & Tablets",
        nameBn: "স্মার্টফোন ও ট্যাবলেট",
        items: [
          { nameEn: "Smartphones", nameBn: "স্মার্টফোন" },
          { nameEn: "Tablets", nameBn: "ট্যাবলেট" },
          { nameEn: "Mobile Accessories", nameBn: "মোবাইল অ্যাক্সেসরিজ" }
        ]
      },
      {
        nameEn: "Computers & Accessories",
        nameBn: "কম্পিউটার ও অ্যাক্সেসরিজ",
        items: [
          { nameEn: "Laptops", nameBn: "ল্যাপটপ" },
          { nameEn: "Keyboards & Mice", nameBn: "কিবোর্ড ও মাউস" },
          { nameEn: "Storage (USB, HDD)", nameBn: "স্টোরেজ ড্রাইভ" }
        ]
      },
      {
        nameEn: "Audio & Wearables",
        nameBn: "অডিও ও পরিধানযোগ্য গ্যাজেট",
        items: [
          { nameEn: "Headphones & Earbuds", nameBn: "হেডফোন ও ইয়ারবাড" },
          { nameEn: "Smartwatches", nameBn: "স্মার্টওয়াচ" },
          { nameEn: "Bluetooth Speakers", nameBn: "ব্লুটুথ স্পিকার" }
        ]
      }
    ]
  },
  {
    id: "daily-essentials",
    nameEn: "Daily Essentials",
    nameBn: "নিত্য প্রয়োজনীয় পণ্য",
    icon: "🛒",
    subs: [
      {
        nameEn: "Grocery",
        nameBn: "মুদি পণ্য",
        items: [
          { nameEn: "Rice & Pulses", nameBn: "চাল ও ডাল" },
          { nameEn: "Oil & Spices", nameBn: "তেল ও মসলা" },
          { nameEn: "Salt & Sugar", nameBn: "লবণ ও চিনি" }
        ]
      },
      {
        nameEn: "Snacks & Beverages",
        nameBn: "স্ন্যাক্স ও পানীয়",
        items: [
          { nameEn: "Biscuits & Chips", nameBn: "বিস্কুট ও চিপস" },
          { nameEn: "Tea & Coffee", nameBn: "চা ও কফি" },
          { nameEn: "Soft Drinks", nameBn: "সফট ড্রিংকস" }
        ]
      },
      {
        nameEn: "Cleaning & Hygiene",
        nameBn: "পরিষ্কার ও স্বাস্থ্যবিধি",
        items: [
          { nameEn: "Soaps & Handwash", nameBn: "সাবান ও হ্যান্ডওয়াশ" },
          { nameEn: "Detergents", nameBn: "ডিটারজেন্ট" },
          { nameEn: "Tissue Papers", nameBn: "টিস্যু পেপার" }
        ]
      }
    ]
  }
];

const slugify = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + Math.floor(Math.random()*1000);
}

async function seed() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const connection = await db.getConnection();
  console.log('Connected to DB. Starting seed...');
  
  try {
    for (const cat of CATEGORIES_TREE) {
      console.log(`Inserting parent: ${cat.nameEn}`);
      
      // Check if exists
      let [rows] = await connection.query('SELECT id FROM categories WHERE name_en = ? AND parent_id IS NULL', [cat.nameEn]);
      let parentId = null;
      
      if (rows.length > 0) {
        parentId = rows[0].id;
      } else {
        const [res] = await connection.query('INSERT INTO categories (name_en, name_bn, slug) VALUES (?, ?, ?)', [
          cat.nameEn, cat.nameBn, slugify(cat.nameEn)
        ]);
        parentId = res.insertId;
      }

      for (const sub of cat.subs) {
        console.log(`  Inserting sub: ${sub.nameEn}`);
        let [sRows] = await connection.query('SELECT id FROM categories WHERE name_en = ? AND parent_id = ?', [sub.nameEn, parentId]);
        let subId = null;
        if (sRows.length > 0) {
          subId = sRows[0].id;
        } else {
          const [res] = await connection.query('INSERT INTO categories (name_en, name_bn, slug, parent_id) VALUES (?, ?, ?, ?)', [
            sub.nameEn, sub.nameBn, slugify(sub.nameEn), parentId
          ]);
          subId = res.insertId;
        }

        for (const item of sub.items) {
          let [iRows] = await connection.query('SELECT id FROM categories WHERE name_en = ? AND parent_id = ?', [item.nameEn, subId]);
          if (iRows.length === 0) {
            await connection.query('INSERT INTO categories (name_en, name_bn, slug, parent_id) VALUES (?, ?, ?, ?)', [
              item.nameEn, item.nameBn, slugify(item.nameEn), subId
            ]);
          }
        }
      }
    }
    console.log('Seed completed successfully!');
  } finally {
    connection.release();
  }
}

seed().catch(err => {
  console.error('Error during seeding:', err);
  process.exit(1);
});
