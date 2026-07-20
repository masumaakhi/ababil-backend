const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database Migration Script
 * Run: node migrate.js
 * অথবা backend start হলে index.js থেকে auto-run হবে
 */
async function runMigrations() {
  let rootDb;
  let db;

  try {
    // 1. Parse URL to get DB name
    const { URL } = require('url');
    const dbUrl = new URL(process.env.DATABASE_URL);
    const dbName = dbUrl.pathname.replace('/', '');

    // 2. Connect to the specific database
    db = await mysql.createConnection(
      process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}'
    );
    console.log(`✅ Connected to database '${dbName}' for migrations.`);

    // ── customers table ──────────────────────────────────────────────────────

    await db.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        email        VARCHAR(150) UNIQUE,
        phone        VARCHAR(20)  UNIQUE DEFAULT NULL,
        password     VARCHAR(255)        DEFAULT NULL,
        google_id    VARCHAR(100)        DEFAULT NULL,
        account_type ENUM('guest','customer','google') DEFAULT 'customer',
        is_active    TINYINT(1)          DEFAULT 1,
        created_at   TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Modify existing table if phone was NOT NULL
    try {
      await db.execute('ALTER TABLE customers MODIFY phone VARCHAR(20) UNIQUE DEFAULT NULL;');
    } catch (e) {
      // Ignore if it's already modified or fails for other reasons
    }
    console.log('  ✔ Table: customers');


    // ── admin_roles table ─────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_roles (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255) DEFAULT NULL,
        permissions JSON         NOT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: admin_roles');

    // Seed default Super Admin role if not exists
    try {
      const [existingRoles] = await db.query('SELECT id FROM admin_roles WHERE name = "Super Admin"');
      if (existingRoles.length === 0) {
        const allPerms = JSON.stringify(['manage_admins', 'manage_customers', 'manage_orders', 'manage_products', 'system_settings', 'view_orders', 'view_products', 'view_reports', 'manage_marketing']);
        await db.execute('INSERT INTO admin_roles (name, description, permissions) VALUES (?, ?, ?)', ['Super Admin', 'Full system access', allPerms]);
      }
    } catch (e) {}

    // ── admin_users table ─────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        email        VARCHAR(150) NOT NULL UNIQUE,
        password     VARCHAR(255) NOT NULL,
        role_id      INT                         DEFAULT NULL,
        is_active    TINYINT(1)                  DEFAULT 1,
        created_at   TIMESTAMP                   DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Attempt to migrate existing 'role' ENUM to 'role_id' if needed
    try {
      await db.execute('ALTER TABLE admin_users ADD COLUMN role_id INT DEFAULT NULL');
      await db.execute('ALTER TABLE admin_users ADD CONSTRAINT fk_admin_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE SET NULL');
      
      // Update existing super admins
      await db.execute('UPDATE admin_users SET role_id = (SELECT id FROM admin_roles WHERE name = "Super Admin" LIMIT 1) WHERE role = "super_admin" OR role_id IS NULL');
    } catch (e) {}

    console.log('  ✔ Table: admin_users');

    // ── admin_activity_logs table ─────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        admin_id    INT          NOT NULL,
        action      VARCHAR(100) NOT NULL,
        entity      VARCHAR(100) DEFAULT NULL,
        details     TEXT         DEFAULT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: admin_activity_logs');

    // ── admin_notifications table ─────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        title       VARCHAR(255) NOT NULL,
        message     TEXT         NOT NULL,
        type        ENUM('order', 'auth', 'admin_activity', 'system') DEFAULT 'system',
        is_read     TINYINT(1)   DEFAULT 0,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: admin_notifications');

    // ── categories table ──────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name_en     VARCHAR(100) NOT NULL,
        name_bn     VARCHAR(100) DEFAULT NULL,
        slug        VARCHAR(100) UNIQUE NOT NULL,
        parent_id   INT          DEFAULT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: categories');

    // ── companies table ───────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        name           VARCHAR(150) NOT NULL,
        slug           VARCHAR(150) UNIQUE NOT NULL,
        contact_person VARCHAR(100) DEFAULT NULL,
        email          VARCHAR(150) DEFAULT NULL,
        phone          VARCHAR(20)  DEFAULT NULL,
        status         ENUM('active','inactive') DEFAULT 'active',
        created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: companies');

    // ── brands table ──────────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS brands (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        slug        VARCHAR(100) UNIQUE NOT NULL,
        company_id  INT          DEFAULT NULL,
        status      ENUM('active','inactive') DEFAULT 'active',
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: brands');

    // ── products table ────────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        name_en        VARCHAR(255)  NOT NULL,
        name_bn        VARCHAR(255)  DEFAULT NULL,
        slug           VARCHAR(255)  UNIQUE NOT NULL,
        category_id    INT           NOT NULL,
        brand_id       INT           DEFAULT NULL,
        description    TEXT          DEFAULT NULL,
        base_price     DECIMAL(10,2) NOT NULL,
        old_price      DECIMAL(10,2) DEFAULT NULL,
        base_unit      VARCHAR(50)   DEFAULT NULL,
        images         JSON          DEFAULT NULL,
        status         ENUM('active','draft') DEFAULT 'active',
        is_featured    TINYINT(1)    DEFAULT 0,
        is_recommended TINYINT(1)    DEFAULT 0,
        created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: products');

    // ── product_variants table ────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        product_id  INT           NOT NULL,
        name        VARCHAR(100)  NOT NULL,
        price       DECIMAL(10,2) NOT NULL,
        sku         VARCHAR(100)  DEFAULT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: product_variants');

    // ── inventory table ───────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS inventory (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        product_id      INT NOT NULL,
        variant_id      INT DEFAULT NULL,
        stock           INT NOT NULL DEFAULT 0,
        opening_stock   INT DEFAULT 0,
        purchased_stock INT DEFAULT 0,
        sold_stock      INT DEFAULT 0,
        returned_stock  INT DEFAULT 0,
        adjusted_stock  INT DEFAULT 0,
        reorder_level   INT DEFAULT 10,
        min_stock       INT DEFAULT 0,
        warehouse       VARCHAR(100) DEFAULT 'Main',
        rack_location   VARCHAR(100) DEFAULT NULL,
        batch_number    VARCHAR(100) DEFAULT NULL,
        expiry_date     DATE DEFAULT NULL,
        notes           TEXT DEFAULT NULL,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: inventory');

    // ── inventory_ledger table ────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS inventory_ledger (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        product_id  INT NOT NULL,
        variant_id  INT DEFAULT NULL,
        type        ENUM('opening', 'purchase', 'sale', 'return', 'adjustment', 'damage', 'lost', 'correction') NOT NULL,
        reference   VARCHAR(100) DEFAULT NULL,
        quantity    INT NOT NULL,
        balance     INT NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: inventory_ledger');

    // ── orders table ──────────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        order_id       VARCHAR(20)   NOT NULL UNIQUE,
        customer_id    INT           DEFAULT NULL,
        customer_name  VARCHAR(100)  NOT NULL,
        phone          VARCHAR(20)   NOT NULL,
        email          VARCHAR(150)  DEFAULT NULL,
        address        TEXT          NOT NULL,
        city           VARCHAR(50)   DEFAULT 'Dhaka',
        items          JSON          NOT NULL,
        total          DECIMAL(10,2) NOT NULL,
        payment_method ENUM('cod','bkash') DEFAULT 'cod',
        affiliate_code VARCHAR(50)   DEFAULT NULL,
        status         ENUM('pending','confirmed','processing','shipped','assigned_to_rider','out_for_delivery','delivered','cancelled') DEFAULT 'pending',
        created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: orders');

    try {
      await db.execute('ALTER TABLE orders ADD COLUMN upazila VARCHAR(100) DEFAULT NULL AFTER city;');
      console.log('  ✔ Added upazila column to orders table');
    } catch (e) {
      // Column might already exist
    }

    // ── banners table ──────────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS banners (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        image       VARCHAR(255) NOT NULL,
        title_en    VARCHAR(150) DEFAULT NULL,
        title_bn    VARCHAR(150) DEFAULT NULL,
        desc_en     VARCHAR(255) DEFAULT NULL,
        desc_bn     VARCHAR(255) DEFAULT NULL,
        badge_en    VARCHAR(100) DEFAULT NULL,
        badge_bn    VARCHAR(100) DEFAULT NULL,
        type        ENUM('home', 'category') DEFAULT 'home',
        category_id INT          DEFAULT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: banners');

    // ── promo_codes table ─────────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        code           VARCHAR(50)   NOT NULL UNIQUE,
        discount_type  ENUM('percentage','flat') DEFAULT 'percentage',
        discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
        min_order      DECIMAL(10,2) DEFAULT NULL,
        usage_limit    INT           DEFAULT NULL,
        used_count     INT           NOT NULL DEFAULT 0,
        start_date     DATE          DEFAULT NULL,
        end_date       DATE          DEFAULT NULL,
        status         ENUM('active','inactive') DEFAULT 'active',
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: promo_codes');

    // ── flash_sale_settings table ─────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS flash_sale_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_en VARCHAR(150) NOT NULL,
        title_bn VARCHAR(150) DEFAULT NULL,
        desc_en VARCHAR(255) DEFAULT NULL,
        desc_bn VARCHAR(255) DEFAULT NULL,
        end_time DATETIME NOT NULL,
        btn_text_en VARCHAR(100) DEFAULT 'View All Offers',
        btn_text_bn VARCHAR(100) DEFAULT 'সব অফার দেখুন',
        status ENUM('active', 'inactive') DEFAULT 'active',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔ Table: flash_sale_settings');

    // Add columns to products table if they don't exist
     try {
      await db.execute('ALTER TABLE products ADD COLUMN is_flash_sale TINYINT(1) DEFAULT 0;');
      console.log('  ✔ Added is_flash_sale column to products table');
    } catch (e) {
      // Column might already exist
    }

    try {
      await db.execute('ALTER TABLE products ADD COLUMN flash_sale_stock INT DEFAULT 10;');
      console.log('  ✔ Added flash_sale_stock column to products table');
    } catch (e) {
      // Column might already exist
    }

    try {
      await db.execute('ALTER TABLE products ADD COLUMN purchase_price DECIMAL(10,2) DEFAULT NULL;');
      console.log('  ✔ Added purchase_price column to products table');
    } catch (e) {
      // Column might already exist
    }

    try {
      await db.execute('ALTER TABLE product_variants ADD COLUMN purchase_price DECIMAL(10,2) DEFAULT NULL;');
      console.log('  ✔ Added purchase_price column to product_variants table');
    } catch (e) {
      // Column might already exist
    }

    // Add columns to inventory table for ERP system
    const inventoryColumns = [
      'ADD COLUMN opening_stock INT DEFAULT 0',
      'ADD COLUMN purchased_stock INT DEFAULT 0',
      'ADD COLUMN sold_stock INT DEFAULT 0',
      'ADD COLUMN returned_stock INT DEFAULT 0',
      'ADD COLUMN adjusted_stock INT DEFAULT 0',
      'ADD COLUMN reorder_level INT DEFAULT 10',
      'ADD COLUMN min_stock INT DEFAULT 0',
      'ADD COLUMN warehouse VARCHAR(100) DEFAULT "Main"',
      'ADD COLUMN rack_location VARCHAR(100) DEFAULT NULL',
      'ADD COLUMN batch_number VARCHAR(100) DEFAULT NULL',
      'ADD COLUMN expiry_date DATE DEFAULT NULL',
      'ADD COLUMN notes TEXT DEFAULT NULL'
    ];
    for (const colDef of inventoryColumns) {
      try {
        await db.execute(`ALTER TABLE inventory ${colDef};`);
      } catch (e) {
        // Ignore, column likely already exists
      }
    }
    console.log('  ✔ Checked/Added ERP columns to inventory table');

    // Insert default flash sale row if empty
    const [existingFlash] = await db.execute('SELECT id FROM flash_sale_settings LIMIT 1');
    if (existingFlash.length === 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const sqlTomorrow = tomorrow.toISOString().slice(0, 19).replace('T', ' ');
      await db.execute(`
        INSERT INTO flash_sale_settings (title_en, title_bn, desc_en, desc_bn, end_time)
        VALUES (?, ?, ?, ?, ?)
      `, [
        'Flash Sale Extravaganza', 
        'ফ্ল্যাশ সেল অফার', 
        "Don't miss out! Premium brands at unbeatable prices.", 
        'সীমিত সময়ের জন্য অবিশ্বাস্য মূল্যে প্রিমিয়াম ব্র্যান্ড অফার!', 
        sqlTomorrow
      ]);
      console.log('  ✔ Default flash sale settings row inserted');
    }

    // ── Default Super Admin (যদি না থাকে) ─────────────────────────────────────
    // Default password: Admin@1234
    const bcrypt = require('bcrypt');
    const [existing] = await db.execute(
      'SELECT id FROM admin_users WHERE email = ?',
      ['admin@ababil.com']
    );
    if (existing.length === 0) {
      const hashed = await bcrypt.hash('Admin@1234', 10);
      await db.execute(
        'INSERT INTO admin_users (name, email, password, role) VALUES (?, ?, ?, ?)',
        ['Super Admin', 'admin@ababil.com', hashed, 'super_admin']
      );
      console.log('  ✔ Default super admin created: admin@ababil.com / Admin@1234');
    } else {
      console.log('  ✔ Super admin already exists — skipped.');
    }

    console.log('\n🎉 All migrations completed successfully!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (db) await db.end();
  }
}

module.exports = runMigrations;

// Direct run: node migrate.js
if (require.main === module) {
  runMigrations();
}
