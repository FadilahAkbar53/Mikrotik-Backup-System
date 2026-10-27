require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const fs = require('fs');
const localsMiddleware = require('./middlewares/locals');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');
const { initRetentionCron } = require('./cron/retentionCron');

// Ensure base storage directory exists on startup
const storageBackupsDir = path.join(process.cwd(), 'storage', 'backups');
if (!fs.existsSync(storageBackupsDir)) {
    fs.mkdirSync(storageBackupsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (Nginx, Caddy, Cloudflare) on VPS
app.set('trust proxy', 1);

// View engine setup with express-ejs-layouts
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    return res.sendFile(path.join(__dirname, '../public/icon-MikBack.svg'));
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Support method overriding (for PUT & DELETE in HTML forms)
app.use(methodOverride('_method'));

// Raw body parser for MikroTik fetch command sending raw streams
app.use('/api', express.raw({ type: ['application/octet-stream', 'text/plain'], limit: '50mb' }));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Persistent MySQL Session Store configuration
const mysql = require('mysql2/promise');
const MySQLStore = require('express-mysql-session')(session);

const sessionPool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'mikrotik_backup',
    connectTimeout: 20000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

const sessionIdleMinutes = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '120', 10);
const sessionIdleMs = sessionIdleMinutes * 60 * 1000;

const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 5 * 60 * 1000, // Clean expired sessions every 5 mins
    expiration: sessionIdleMs, // Purge idle sessions from database
    createDatabaseTable: true,
    schema: {
        tableName: 'express_sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, sessionPool);

sessionStore.on('error', (err) => {
    console.error('[MySQL Session Store Error]:', err.message);
});

if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'mikrotik_secret_key_session_2026')) {
    console.warn('[SECURITY WARNING] SESSION_SECRET is using default fallback in production. Please set a strong unique SESSION_SECRET in your .env file!');
}

// Session configuration with persistent MySQL storage and security flags
app.use(session({
    name: 'mikback_sid', // Obscure default connect.sid identifier
    secret: process.env.SESSION_SECRET || 'mikrotik_secret_key_session_2026',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset cookie expiration on every active request
    cookie: {
        maxAge: sessionIdleMs, // Automatically expires after inactivity
        httpOnly: true, // Mitigate XSS attacks reading session cookie
        sameSite: 'lax', // Protect against CSRF
        secure: process.env.NODE_ENV === 'production' && (process.env.APP_URL?.startsWith('https') || false)
    }
}));

// Flash notifications
app.use(flash());

// Global template locals (currentUser, flash, helpers)
app.use(localsMiddleware);

// Mount routes
app.use('/api', apiRoutes);
app.use('/', webRoutes);

// 404 Handler
app.use((req, res) => {
    const isAuth = !!(req.session && req.session.user);
    res.status(404).render('errors/404', {
        title: '404 - Halaman Tidak Ditemukan',
        layout: isAuth ? 'layout' : false
    });
});

// Global Error Handler (Item D: Information Disclosure Protection)
app.use((err, req, res, next) => {
    console.error('[Unhandled Application Error]:', err);

    const isDev = process.env.NODE_ENV !== 'production';
    const statusCode = err.status || err.statusCode || 500;

    // API or AJAX client response
    if (req.path.startsWith('/api') || req.xhr || !req.accepts('html')) {
        return res.status(statusCode).json({
            status: 'error',
            message: isDev ? (err.message || 'Internal Server Error') : 'Terjadi kesalahan internal pada server.',
            ...(isDev ? { stack: err.stack } : {})
        });
    }

    // Web browser UI response (prevents directory and credential leaks in production)
    const isAuth = !!(req.session && req.session.user);
    res.status(statusCode).render('errors/500', {
        title: '500 - Terjadi Kesalahan Server',
        layout: isAuth ? 'layout' : false,
        error: isDev ? err : null,
        isDev,
        message: isDev ? (err.message || err.stack) : 'Sistem mengalami kendala saat memproses permintaan. Detail teknis disembunyikan demi keamanan sistem.'
    });
});

// Initialize automatic database schema verification
const schemaMigrationService = require('./services/schemaMigrationService');
schemaMigrationService.init();

// Start scheduled background retention task
initRetentionCron();

// Initialize durable backup processing queue
const backupQueueService = require('./services/backupQueueService');
backupQueueService.init();

// Initialize native FTP receiver for MikroTik RouterOS (.backup and .rsc uploads)
const ftpBackupService = require('./services/ftpBackupService');
ftpBackupService.start();

// Initialize incoming directory watcher for SFTP/SCP/manual uploads
const incomingWatcherService = require('./services/incomingWatcherService');
incomingWatcherService.start();

// Start Server
const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` MikroTik Backup Monitoring System (Express.js)`);
    console.log(` Server running on: http://localhost:${PORT}`);
    console.log(` Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
});

// Graceful Shutdown on VPS (PM2 / Systemd)
const gracefulShutdown = (signal) => {
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
        console.log('[Server] HTTP connections closed.');
        try {
            incomingWatcherService.stop();
            await ftpBackupService.stop();
            const db = require('./config/database');
            await db.destroy();
            console.log('[Server] Database pool closed.');
        } catch (e) {}
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Server] Force exit: shutdown took too long.');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

