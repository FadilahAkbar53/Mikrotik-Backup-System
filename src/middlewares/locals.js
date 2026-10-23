const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
require('dayjs/locale/id');
dayjs.extend(relativeTime);
dayjs.locale('id');

module.exports = (req, res, next) => {
    res.locals.currentUser = req.session ? req.session.user : null;
    res.locals.impersonatorId = req.session ? req.session.impersonatorId : null;
    res.locals.flash = {
        success: req.flash('success'),
        error: req.flash('error'),
        info: req.flash('info')
    };
    res.locals.currentPath = req.path;
    res.locals.appName = process.env.APP_NAME || 'MikroTik Backup System';
    res.locals.appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    
    // Formatting helpers
    res.locals.formatDate = (date, format = 'DD MMM YYYY HH:mm') => {
        if (!date) return '—';
        return dayjs(date).format(format);
    };
    res.locals.diffForHumans = (date) => {
        if (!date) return 'Belum Ada';
        return dayjs(date).fromNow();
    };
    res.locals.formatBytes = (bytes) => {
        const b = parseInt(bytes, 10) || 0;
        if (b <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(b) / Math.log(1024));
        return parseFloat((b / Math.pow(1024, i)).toFixed(2)) + ' ' + (units[i] || 'B');
    };

    next();
};