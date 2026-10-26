const db = require('../config/database');
const settingService = require('../services/settingService');
const activityLogService = require('../services/activityLogService');

module.exports = {
    async index(req, res) {
        try {
            const [settings, templates] = await Promise.all([
                settingService.getAll(),
                db('script_templates').where('is_active', 1).orderBy('id', 'asc')
            ]);

            return res.render('admin/settings/index', {
                title: 'Pengaturan Aplikasi Terpusat',
                settings,
                templates
            });
        } catch (err) {
            console.error('[AdminSettingController] Error loading settings:', err);
            req.flash('error', 'Gagal memuat pengaturan aplikasi: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    async update(req, res) {
        try {
            const {
                app_name,
                app_url,
                app_timezone,
                ftp_host,
                ftp_port,
                health_threshold_hours,
                backup_recommendation_time,
                allow_registration,
                default_script_template
            } = req.body;

            const descriptions = {
                app_name: 'Nama resmi aplikasi yang tampil pada browser dan antarmuka sistem.',
                app_url: 'Domain atau alamat URL publik web aplikasi monitoring.',
                app_timezone: 'Zona waktu standar operasional sistem (Default: Asia/Jakarta).',
                ftp_host: 'Alamat hostname atau IP public FTP receiver yang dituju oleh MikroTik RouterOS.',
                ftp_port: 'Port TCP native daemon FTP receiver (Default: 2121).',
                health_threshold_hours: 'Batas toleransi keterlambatan waktu backup router sebelum ditandai bermasalah.',
                backup_recommendation_time: 'Waktu eksekusi backup yang direkomendasikan pada generator scheduler MikroTik.',
                allow_registration: 'Sakelar izin pendaftaran akun tenant baru secara publik.',
                default_script_template: 'Template default yang dipilih secara otomatis pada pembuatan script router.'
            };

            const payload = {
                app_name: (app_name || 'MikBack').trim(),
                app_url: (app_url || 'https://mikback.terrafa.tech').trim().replace(/\/+$/, ''),
                app_timezone: (app_timezone || 'Asia/Jakarta').trim(),
                ftp_host: (ftp_host || 'mikback.terrafa.tech').trim(),
                ftp_port: String(parseInt(ftp_port || '2121', 10)),
                health_threshold_hours: String(parseInt(health_threshold_hours || '24', 10)),
                backup_recommendation_time: (backup_recommendation_time || '02:00:00').trim(),
                allow_registration: allow_registration === '1' || allow_registration === 'on' ? '1' : '0',
                default_script_template: (default_script_template || 'one_click_setup').trim()
            };

            await settingService.setMany(payload, descriptions);

            await activityLogService.log({
                userId: req.session.user.id,
                type: 'system',
                action: 'Pembaruan Pengaturan Aplikasi',
                description: `Administrator '${req.session.user.name}' memperbarui konfigurasi sistem terpusat (FTP Host: ${payload.ftp_host}:${payload.ftp_port}, Ambang Batas: ${payload.health_threshold_hours} Jam)`,
                ipAddress: req.ip,
                status: 'info',
                metadata: payload
            });

            req.flash('success', 'Pengaturan aplikasi terpusat berhasil diperbarui dan diterapkan ke seluruh sistem!');
            return res.redirect('/admin/settings');
        } catch (err) {
            console.error('[AdminSettingController] Error saving settings:', err);
            req.flash('error', 'Gagal menyimpan pengaturan: ' + err.message);
            return res.redirect('/admin/settings');
        }
    }
};
