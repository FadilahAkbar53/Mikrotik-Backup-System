const retentionService = require('../services/retentionService');

module.exports = {
    async index(req, res) {
        try {
            const overview = await retentionService.getStorageOverview();
            return res.render('admin/retention/index', {
                title: 'Retensi & Storage',
                overview
            });
        } catch (err) {
            console.error('Retention index error:', err);
            req.flash('error', 'Gagal memuat halaman retensi: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    async update(req, res) {
        try {
            const maxMonths = parseInt(req.body.retention_max_months, 10) || 4;
            const maxDays = parseInt(req.body.retention_max_days_per_month, 10) || 7;
            const autoPrune = req.body.retention_auto_prune_enabled === '1' || req.body.retention_auto_prune_enabled === 'on';
            const pruneOnUpload = req.body.retention_prune_on_upload === '1' || req.body.retention_prune_on_upload === 'on';
            const replaceSameDay = req.body.retention_replace_same_day === '1' || req.body.retention_replace_same_day === 'on';

            await retentionService.setSetting('retention_max_months', maxMonths, 'integer');
            await retentionService.setSetting('retention_max_days_per_month', maxDays, 'integer');
            await retentionService.setSetting('retention_auto_prune_enabled', autoPrune ? '1' : '0', 'boolean');
            await retentionService.setSetting('retention_prune_on_upload', pruneOnUpload ? '1' : '0', 'boolean');
            await retentionService.setSetting('retention_replace_same_day', replaceSameDay ? '1' : '0', 'boolean');

            req.flash('success', 'Pengaturan kebijakan retensi berhasil diperbarui!');
            return res.redirect('/admin/retention');
        } catch (err) {
            console.error('Retention update error:', err);
            req.flash('error', 'Gagal memperbarui pengaturan: ' + err.message);
            return res.redirect('/admin/retention');
        }
    },

    async prune(req, res) {
        try {
            const isDryRun = req.query.dry_run === '1' || req.body.dry_run === '1';
            const result = await retentionService.pruneAll(isDryRun);

            if (isDryRun || req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({
                    success: true,
                    data: result
                });
            }

            req.flash('success', `Pembersihan selesai! Sebanyak ${result.total_files_pruned} berkas dibersihkan (Menghemat ${result.total_bytes_saved_formatted}).`);
            return res.redirect('/admin/retention');
        } catch (err) {
            console.error('Retention prune error:', err);
            if (req.query.dry_run === '1' || req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            req.flash('error', 'Gagal mengeksekusi pembersihan: ' + err.message);
            return res.redirect('/admin/retention');
        }
    }
};