module.exports = {
    isAuthenticated(req, res, next) {
        if (req.session && req.session.user) {
            return next();
        }
        req.session.returnTo = req.originalUrl;
        req.flash('error', 'Silakan login terlebih dahulu untuk mengakses halaman ini.');
        return res.redirect('/login');
    },

    isGuest(req, res, next) {
        if (req.session && req.session.user) {
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