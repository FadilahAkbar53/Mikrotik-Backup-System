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

// Favicon handler: redirect if opened directly in address bar, or return 204 No Content for asset requests
app.get('/favicon.ico', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/');
    }
    return res.status(204).end();
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

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'mikrotik_secret_key_session_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' ? 'auto' : false
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

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Application Error:', err);
    res.status(500).send(`<h1>500 Internal Server Error</h1><pre>${err.stack || err.message}</pre>`);
});

// Start scheduled background retention task
initRetentionCron();

// Initialize durable backup processing queue
const backupQueueService = require('./services/backupQueueService');
backupQueueService.init();

// Initialize native FTP receiver for MikroTik RouterOS (.backup and .rsc uploads)
const ftpBackupService = require('./services/ftpBackupService');
ftpBackupService.start();

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

