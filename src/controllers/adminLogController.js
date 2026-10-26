const db = require('../config/database');
const activityLogService = require('../services/activityLogService');
const dayjs = require('dayjs');

module.exports = {
    async index(req, res) {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 25;
            const type = (req.query.type || 'all').trim();
            const status = (req.query.status || 'all').trim();
            const search = (req.query.search || '').trim();

            const [logData, statsRows] = await Promise.all([
                activityLogService.getLogs({ page, limit, type, status, search }),
                db('activity_logs').select(
                    db.raw('COUNT(*) as total_count'),
                    db.raw("COUNT(CASE WHEN type = 'ftp_upload' THEN 1 END) as ftp_count"),
                    db.raw("COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count"),
                    db.raw("COUNT(CASE WHEN type IN ('auth', 'impersonate') THEN 1 END) as security_count")
                ).first()
            ]);

            const stats = {
                total: parseInt(statsRows?.total_count || '0', 10),
                ftpCount: parseInt(statsRows?.ftp_count || '0', 10),
                errorCount: parseInt(statsRows?.error_count || '0', 10),
                securityCount: parseInt(statsRows?.security_count || '0', 10)
            };

            res.render('admin/logs/index', {
                title: 'Audit & System Logs',
                logs: logData.logs,
                total: logData.total,
                page: logData.page,
                limit: logData.limit,
                totalPages: logData.totalPages,
                currentType: type,
                currentStatus: status,
                currentSearch: search,
                stats,
                dayjs
            });
        } catch (err) {
            console.error('[AdminLogController] Error loading logs:', err);
            req.flash('error', 'Gagal memuat log sistem: ' + err.message);
            res.redirect('/dashboard');
        }
    },

    async prune(req, res) {
        try {
            const days = parseInt(req.body.days || '30', 10);
            const deleted = await activityLogService.pruneOldLogs(days);
            
            await activityLogService.log({
                userId: req.session.user.id,
                type: 'system',
                action: 'Pembersihan Log Sistem',
                description: `Administrator '${req.session.user.name}' membersihkan ${deleted} baris log yang lebih lama dari ${days} hari`,
                ipAddress: req.ip,
                status: 'info'
            });

            req.flash('success', `Berhasil membersihkan ${deleted} entri log yang lebih lama dari ${days} hari.`);
            res.redirect('/admin/logs');
        } catch (err) {
            console.error('[AdminLogController] Error pruning logs:', err);
            req.flash('error', 'Gagal membersihkan log sistem: ' + err.message);
            res.redirect('/admin/logs');
        }
    }
};
