const mysql = require('mysql2/promise');
require('dotenv').config();

async function runPatch() {
  let db;
  try {
    db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    console.log('✅ Connected to database.');

    // 1. Create admin_roles table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        permissions JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✔ admin_roles table ensured.');

    // 2. Add role_id to admin_users if it doesn't exist
    try {
      await db.execute(`
        ALTER TABLE admin_users 
        ADD COLUMN role_id INT DEFAULT NULL AFTER password,
        ADD CONSTRAINT fk_admin_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE SET NULL;
      `);
      console.log('✔ role_id column added to admin_users.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('✔ role_id column already exists.');
      } else {
        throw e;
      }
    }

    // 3. Create default roles
    const allPermissions = JSON.stringify([
      "manage_admins", "manage_customers", "manage_orders", 
      "manage_products", "system_settings", "view_orders", 
      "view_products", "view_reports"
    ]);

    const basicPermissions = JSON.stringify([
      "view_orders", "view_products", "view_reports"
    ]);

    let superAdminRoleId, adminRoleId;

    // Check if Super Admin role exists
    const [superRows] = await db.execute('SELECT id FROM admin_roles WHERE name = "Super Admin"');
    if (superRows.length === 0) {
      const [res] = await db.execute(
        'INSERT INTO admin_roles (name, description, permissions) VALUES (?, ?, ?)',
        ['Super Admin', 'Full system access', allPermissions]
      );
      superAdminRoleId = res.insertId;
      console.log('✔ Super Admin role created.');
    } else {
      superAdminRoleId = superRows[0].id;
      // Ensure super admin has all permissions
      await db.execute('UPDATE admin_roles SET permissions = ? WHERE id = ?', [allPermissions, superAdminRoleId]);
    }

    // Check if Admin role exists
    const [adminRows] = await db.execute('SELECT id FROM admin_roles WHERE name = "Editor"');
    if (adminRows.length === 0) {
      const [res] = await db.execute(
        'INSERT INTO admin_roles (name, description, permissions) VALUES (?, ?, ?)',
        ['Editor', 'Manage content and products', basicPermissions]
      );
      adminRoleId = res.insertId;
      console.log('✔ Editor role created.');
    } else {
      adminRoleId = adminRows[0].id;
    }

    // 4. Migrate existing users
    // If 'role' column still exists, migrate from it
    try {
      const [cols] = await db.execute("SHOW COLUMNS FROM admin_users LIKE 'role'");
      if (cols.length > 0) {
        await db.execute('UPDATE admin_users SET role_id = ? WHERE role = "super_admin"', [superAdminRoleId]);
        await db.execute('UPDATE admin_users SET role_id = ? WHERE role = "admin"', [adminRoleId]);
        console.log('✔ Existing users migrated to new roles.');
        
        // Drop old role column
        await db.execute('ALTER TABLE admin_users DROP COLUMN role');
        console.log('✔ Old role column dropped.');
      }
    } catch (e) {
      console.log('Checking role column error:', e.message);
    }

    console.log('🎉 RBAC patch completed successfully!');
  } catch (err) {
    console.error('❌ Patch failed:', err);
  } finally {
    if (db) await db.end();
  }
}

runPatch();
