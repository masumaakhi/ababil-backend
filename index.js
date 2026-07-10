const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const mysql      = require('mysql2/promise');
const helmet     = require('helmet');
const morgan     = require('morgan');
const runMigrations = require('./migrate');
const logAdminActivity = require('./middleware/activityLogger');

// Load environment variables
dotenv.config();


const app  = express();
const PORT = process.env.PORT || 5250;

// ── Middleware ──────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.ADMIN_URL || 'http://localhost:3001'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── MySQL Connection Pool ───────────────────────────────────────────────────
let db;
try {
  db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  console.log('✅ MySQL connection pool initialized (Railway).');
} catch (error) {
  console.error('❌ Failed to initialize MySQL pool:', error.message);
}

// ── Routes ──────────────────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const productRoutes   = require('./routes/products');
const orderRoutes     = require('./routes/orders');
const bannerRoutes    = require('./routes/banners');
const adminAuthRoutes = require('./routes/admin.auth');
const adminCustomerRoutes = require('./routes/admin.customers');
const adminProductRoutes = require('./routes/admin.products');
const adminBrandRoutes = require('./routes/admin.brands');
const adminCompanyRoutes = require('./routes/admin.companies');
const adminOrderRoutes = require('./routes/admin.orders');
const adminAffiliateRoutes = require('./routes/admin.affiliates');
const adminManagementRoutes = require('./routes/admin.management');
const adminRolesRoutes = require('./routes/admin.roles');
const adminBannerRoutes = require('./routes/admin.banners');
const flashSaleRoutes = require('./routes/flash-sale');
const adminFlashSaleRoutes = require('./routes/admin.flash-sale');
const adminDashboardRoutes = require('./routes/admin.dashboard');
const adminPromosRoutes = require('./routes/admin.promos');
const adminHomeSectionsRoutes = require('./routes/admin.home-sections');
const adminInventoryRoutes = require('./routes/admin.inventory');
const adminActivityRoutes = require('./routes/admin.activity');
const adminSettingsRoutes = require('./routes/admin.settings');
const adminNotificationsRoutes = require('./routes/admin.notifications');

app.use('/api/auth',       authRoutes(db));
app.use('/api/products',   productRoutes(db));
app.use('/api/orders',     orderRoutes(db));
app.use('/api/banners',    bannerRoutes(db));
app.use('/api/flash-sale', flashSaleRoutes(db));

app.use('/api/admin/auth', adminAuthRoutes(db));

// Apply activity logger to all other admin routes
app.use('/api/admin', logAdminActivity(db));

app.use('/api/admin/customers', adminCustomerRoutes(db));
app.use('/api/admin/products', adminProductRoutes(db));
app.use('/api/admin/brands', adminBrandRoutes(db));
app.use('/api/admin/companies', adminCompanyRoutes(db));
app.use('/api/admin/orders', adminOrderRoutes(db));
app.use('/api/admin/affiliates', adminAffiliateRoutes(db));
app.use('/api/admin/management', adminManagementRoutes(db));
app.use('/api/admin/roles', adminRolesRoutes(db));
app.use('/api/admin/banners', adminBannerRoutes(db));
app.use('/api/admin/flash-sale', adminFlashSaleRoutes(db));
app.use('/api/admin/dashboard', adminDashboardRoutes(db));
app.use('/api/admin/promos', adminPromosRoutes(db));
app.use('/api/admin/home-sections', adminHomeSectionsRoutes(db));
app.use('/api/admin/inventory', adminInventoryRoutes(db));
app.use('/api/admin/activity', adminActivityRoutes(db));
app.use('/api/admin/settings', adminSettingsRoutes(db));
app.use('/api/admin/notifications', adminNotificationsRoutes(db));


// ── Root Endpoint ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Ababil Shop Backend API',
    status:  'Running',
    version: '1.0.0',
    port:    PORT
  });
});

// ── Debug Pool ────────────────────────────────────────────────────────────
app.get('/api/debug-pool', (req, res) => {
  if (!db) return res.send('No db');
  res.json({
    total: db.pool._allConnections.length,
    free: db.pool._freeConnections.length,
    queue: db.pool._connectionQueue.length
  });
});

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  console.log('Health check requested');
  if (!db) {
    return res.status(500).json({ status: 'Error', database: 'Pool not initialized' });
  }
  try {
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
    res.json({ status: 'OK', database: 'Connected', timestamp: new Date() });
  } catch (err) {
    res.status(500).json({ status: 'Degraded', database: 'Disconnected', error: err.message });
  }
});

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});
// trigger restart
