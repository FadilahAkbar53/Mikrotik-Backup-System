const db = require('../config/database');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const activityLogService = require('../services/activityLogService');

module.exports = {
    async index(req, res) {
        try {
            const currentUserId = req.session.user.id;
            const user = await db('users').where({ id: currentUserId }).first();

            if (!user) {
                req.flash('error', 'Data pengguna tidak ditemukan.');
                return res.redirect('/dashboard');
            }

            // Summary stats for user
            const routers = await db('routers').where({ user_id: currentUserId });
            const backupStats = await db('backups')
                .join('routers', 'backups.router_id', 'routers.id')
                .where('routers.user_id', currentUserId)
                .select(
                    db.raw('COUNT(backups.id) as total_backups'),
                    db.raw('COALESCE(SUM(backups.file_size), 0) as total_size')
                )
                .first();

            // Recent activity logs for this user
            const recentLogs = await db('activity_logs')
                .where({ user_id: currentUserId })
                .orderBy('created_at', 'desc')
                .limit(6);

            return res.render('profile/index', {
                title: 'Profil & Keamanan Akun',
                user,
                stats: {
                    totalRouters: routers.length,
                    totalBackups: parseInt(backupStats?.total_backups || '0', 10),
                    totalSize: parseInt(backupStats?.total_size || '0', 10)
                },
                recentLogs
            });
        } catch (err) {
            console.error('[ProfileController] Index error:', err);
            req.flash('error', 'Gagal memuat halaman profil: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    async updateProfile(req, res) {
        try {
            const currentUserId = req.session.user.id;
            const { name, email } = req.body;

            if (!name || !email || !name.trim() || !email.trim()) {
                req.flash('error', 'Nama dan email wajib diisi.');
                return res.redirect('/profile');
            }

            const cleanEmail = email.trim().toLowerCase();
            const cleanName = name.trim();

            // Check if email already used by another user
            const existing = await db('users')
                .where({ email: cleanEmail })
                .whereNot({ id: currentUserId })
                .first();

            if (existing) {
                req.flash('error', 'Alamat email tersebut sudah digunakan oleh akun lain.');
                return res.redirect('/profile');
            }

            await db('users').where({ id: currentUserId }).update({
                name: cleanName,
                email: cleanEmail,
                updated_at: db.fn.now()
            });

            // Update session
            req.session.user.name = cleanName;
            req.session.user.email = cleanEmail;

            const nowStr = dayjs().format('DD MMMM YYYY, HH:mm') + ' WIB';

            await activityLogService.log({
                userId: currentUserId,
                type: 'auth',
                action: 'Pembaruan Profil Mandiri',
                description: `Pengguna '${cleanName}' memperbarui informasi profil akun (Nama: ${cleanName}, Email: ${cleanEmail})`,
                ipAddress: req.ip,
                status: 'info'
            });

            req.flash('success', `Profil berhasil diperbarui pada ${nowStr}.`);
            return res.redirect('/profile');
        } catch (err) {
            console.error('[ProfileController] UpdateProfile error:', err);
            req.flash('error', 'Gagal memperbarui profil: ' + err.message);
            return res.redirect('/profile');
        }
    },

    async updatePassword(req, res) {
        try {
            const currentUserId = req.session.user.id;
            const { current_password, new_password, confirm_password } = req.body;

            if (!current_password || !new_password || !confirm_password) {
                req.flash('error', 'Semua kolom kata sandi wajib diisi.');
                return res.redirect('/profile');
            }

            const user = await db('users').where({ id: currentUserId }).first();
            if (!user) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/login');
            }

            // Verify old password
            const isMatch = bcrypt.compareSync(current_password, user.password);
            if (!isMatch) {
                req.flash('error', 'Kata sandi saat ini yang Anda masukkan salah.');
                return res.redirect('/profile');
            }

            // Verify length
            if (new_password.trim().length < 8) {
                req.flash('error', 'Kata sandi baru minimal harus terdiri dari 8 karakter.');
                return res.redirect('/profile');
            }

            // Verify confirmation
            if (new_password !== confirm_password) {
                req.flash('error', 'Konfirmasi kata sandi baru tidak cocok.');
                return res.redirect('/profile');
            }

            // Check if same as old
            if (current_password === new_password) {
                req.flash('error', 'Kata sandi baru tidak boleh sama dengan kata sandi saat ini.');
                return res.redirect('/profile');
            }

            const hashedPassword = bcrypt.hashSync(new_password.trim(), 10);
            await db('users').where({ id: currentUserId }).update({
                password: hashedPassword,
                updated_at: db.fn.now()
            });

            const nowStr = dayjs().format('DD MMMM YYYY, HH:mm') + ' WIB';

            await activityLogService.log({
                userId: currentUserId,
                type: 'auth',
                action: 'Perubahan Kata Sandi Mandiri',
                description: `Pengguna '${user.name}' berhasil mengubah kata sandi akunnya sendiri`,
                ipAddress: req.ip,
                status: 'success'
            });

            req.flash('success', `Kata sandi Anda berhasil diperbarui pada ${nowStr}.`);
            return res.redirect('/profile');
        } catch (err) {
            console.error('[ProfileController] UpdatePassword error:', err);
            req.flash('error', 'Gagal memperbarui kata sandi: ' + err.message);
            return res.redirect('/profile');
        }
    }
};
