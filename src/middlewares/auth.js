const db = require('../config/database');
const activityLogService = require('../services/activityLogService');

module.exports = {
    async isAuthenticated(req, res, next) {
        // 1. Basic check: session & user object must exist
        if (!req.session || !req.session.user) {
            if (req.path.startsWith('/api') || req.xhr || !req.accepts('html')) {
                return res.status(401).json({
                    status: 'error',
                    code: 'UNAUTHENTICATED',
                    message: 'Silakan login terlebih dahulu untuk mengakses API.'
                });
            }
            if (req.session) {
                req.session.returnTo = req.originalUrl;
            }
            req.flash('error', 'Silakan login terlebih dahulu untuk mengakses halaman ini.');
            return res.redirect('/login');
        }

        const now = Date.now();
        const IDLE_TIMEOUT_MINS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '120', 10);
        const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINS * 60 * 1000;
        const MAX_LIFETIME_HOURS = parseInt(process.env.SESSION_MAX_LIFETIME_HOURS || '12', 10);
        const MAX_LIFETIME_MS = MAX_LIFETIME_HOURS * 60 * 60 * 1000;

        // 2. Enforce Idle / Inactivity Timeout (e.g. 2 hours of inactivity)
        if (req.session.lastActivity && (now - req.session.lastActivity > IDLE_TIMEOUT_MS)) {
            const timeText = IDLE_TIMEOUT_MINS >= 60
                ? `${(IDLE_TIMEOUT_MINS / 60).toFixed(IDLE_TIMEOUT_MINS % 60 === 0 ? 0 : 1)} jam`
                : `${IDLE_TIMEOUT_MINS} menit`;

            activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Sesi Kedaluwarsa (Inactivity)',
                description: `Sesi login pengguna '${req.session.user.name}' kedaluwarsa secara otomatis karena tidak ada aktivitas selama lebih dari ${timeText}`,
                ipAddress: req.ip,
                status: 'info'
            });

            return req.session.destroy(() => {
                res.clearCookie('mikback_sid');
                if (req.path.startsWith('/api') || req.xhr || !req.accepts('html')) {
                    return res.status(401).json({
                        status: 'error',
                        code: 'SESSION_IDLE_TIMEOUT',
                        message: `Sesi Anda telah kedaluwarsa karena tidak aktif selama lebih dari ${timeText}. Silakan login kembali.`
                    });
                }
                return res.redirect('/login?expired=idle');
            });
        }

        // 3. Enforce Absolute Maximum Session Lifetime (e.g. 12 hours)
        if (req.session.loginAt && (now - req.session.loginAt > MAX_LIFETIME_MS)) {
            activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Sesi Kedaluwarsa (Max Lifetime)',
                description: `Sesi login pengguna '${req.session.user.name}' mencapai batas waktu maksimal (${MAX_LIFETIME_HOURS} jam) dan wajib login ulang demi keamanan`,
                ipAddress: req.ip,
                status: 'info'
            });

            return req.session.destroy(() => {
                res.clearCookie('mikback_sid');
                if (req.path.startsWith('/api') || req.xhr || !req.accepts('html')) {
                    return res.status(401).json({
                        status: 'error',
                        code: 'SESSION_MAX_TIMEOUT',
                        message: 'Batas waktu maksimal sesi Anda telah selesai. Silakan login kembali.'
                    });
                }
                return res.redirect('/login?expired=max');
            });
        }

        // 4. Verify Account Status in Database (instant revocation if suspended or removed)
        try {
            const user = await db('users').select('id', 'name', 'is_active', 'role').where('id', req.session.user.id).first();
            if (!user) {
                return req.session.destroy(() => {
                    res.clearCookie('mikback_sid');
                    return res.redirect('/login');
                });
            }

            if (user.is_active === 0 || user.is_active === false) {
                return req.session.destroy(() => {
                    res.clearCookie('mikback_sid');
                    return res.redirect('/login?expired=suspended');
                });
            }

            // Keep role in sync if changed by admin
            if (user.role !== req.session.user.role) {
                req.session.user.role = user.role;
            }
        } catch (dbErr) {
            // Transient DB warning, allow request if pool is reconnecting
            console.warn('[Auth Middleware DB Check Warning]:', dbErr.message);
        }

        // 5. Update activity timestamp on valid authenticated request
        req.session.lastActivity = now;
        if (!req.session.loginAt) {
            req.session.loginAt = now;
        }

        return next();
    },

    isGuest(req, res, next) {
        if (req.session && req.session.user) {
            const now = Date.now();
            const IDLE_TIMEOUT_MINS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '120', 10);
            const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINS * 60 * 1000;

            // If session was idle and expired, destroy it and let guest view login page
            if (req.session.lastActivity && (now - req.session.lastActivity > IDLE_TIMEOUT_MS)) {
                return req.session.destroy(() => {
                    res.clearCookie('mikback_sid');
                    return next();
                });
            }

            return res.redirect('/dashboard');
        }
        return next();
    },

    isAdmin(req, res, next) {
        if (req.session && req.session.user && req.session.user.role === 'admin') {
            return next();
        }
        req.flash('error', 'Akses ditolak. Fitur ini hanya untuk Administrator.');
        return res.status(403).send('<h1>403 Forbidden</h1><p>Akses ditolak. Halaman ini hanya untuk Administrator.</p><a href="/dashboard">Kembali ke Dashboard</a>');
    }
};