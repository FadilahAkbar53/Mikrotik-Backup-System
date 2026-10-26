const rateLimit = require('express-rate-limit');

/**
 * Rate Limiter for Authentication routes (/login, /register)
 * Max 15 attempts per 15 minutes per IP address
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Terlalu banyak percobaan masuk atau daftar dari alamat IP Anda. Silakan coba lagi dalam 15 menit.',
    handler: (req, res, next, options) => {
        if (req.accepts('html')) {
            if (req.flash) {
                req.flash('error', options.message);
            }
            const redirectPath = req.originalUrl?.includes('register') ? '/register' : '/login';
            return res.redirect(redirectPath);
        }
        return res.status(options.statusCode).json({
            status: 'error',
            message: options.message
        });
    }
});

/**
 * Rate Limiter for Password Modification (/profile/password)
 * Max 10 attempts per 15 minutes per IP address
 */
const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Terlalu banyak percobaan ubah kata sandi. Silakan coba lagi dalam 15 menit demi keamanan akun Anda.',
    handler: (req, res, next, options) => {
        if (req.accepts('html')) {
            if (req.flash) {
                req.flash('error', options.message);
            }
            return res.redirect('/profile');
        }
        return res.status(options.statusCode).json({
            status: 'error',
            message: options.message
        });
    }
});

/**
 * Rate Limiter for API Backup Uploads (/api/upload, /api/backup/upload)
 * Max 60 requests per 1 minute per IP address
 */
const apiUploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Terlalu banyak permintaan unggah backup dari IP Anda. Silakan coba lagi beberapa saat lagi.',
    handler: (req, res, next, options) => {
        return res.status(options.statusCode).json({
            status: 'error',
            message: options.message
        });
    }
});

module.exports = {
    authLimiter,
    passwordLimiter,
    apiUploadLimiter
};
