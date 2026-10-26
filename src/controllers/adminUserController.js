const db = require('../config/database');
const bcrypt = require('bcryptjs');
const activityLogService = require('../services/activityLogService');

module.exports = {
    async index(req, res) {
        try {
            const search = (req.query.search || req.query.q || '').trim();
            const status = (req.query.status || 'all').trim();
            const role = (req.query.role || 'all').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = 15;
            const offset = (page - 1) * limit;

            // 1. KPI Metrics Summary
            const statsRow = await db('users').select(
                db.raw('COUNT(*) as total_users'),
                db.raw("COUNT(CASE WHEN role = 'user' AND (is_active = 1 OR is_active IS NULL) THEN 1 END) as active_tenants"),
                db.raw("COUNT(CASE WHEN is_active = 0 THEN 1 END) as suspended_users"),
                db.raw("COUNT(CASE WHEN role = 'admin' THEN 1 END) as total_admins")
            ).first();

            const stats = {
                total: parseInt(statsRow?.total_users || '0', 10),
                activeTenants: parseInt(statsRow?.active_tenants || '0', 10),
                suspended: parseInt(statsRow?.suspended_users || '0', 10),
                admins: parseInt(statsRow?.total_admins || '0', 10)
            };

            // 2. Filtered User Query
            let query = db('users')
                .leftJoin('routers', 'users.id', 'routers.user_id')
                .leftJoin('backups', 'routers.id', 'backups.router_id');

            if (search) {
                query = query.where(function() {
                    this.where('users.name', 'like', `%${search}%`)
                        .orWhere('users.email', 'like', `%${search}%`);
                });
            }

            if (status === 'active') {
                query = query.where(function() {
                    this.where('users.is_active', 1).orWhereNull('users.is_active');
                });
            } else if (status === 'suspended') {
                query = query.where('users.is_active', 0);
            }

            if (role && role !== 'all') {
                query = query.where('users.role', role);
            }

            const totalRow = await query.clone().clearSelect().countDistinct('users.id as count').first();
            const total = parseInt(totalRow?.count || '0', 10);

            const users = await query.clone()
                .select(
                    'users.*',
                    db.raw('COUNT(DISTINCT routers.id) as routers_count'),
                    db.raw('COALESCE(SUM(backups.file_size), 0) as total_storage')
                )
                .groupBy('users.id')
                .orderBy('users.created_at', 'desc')
                .limit(limit)
                .offset(offset);

            return res.render('admin/users/index', {
                title: 'Kelola Pengguna',
                users,
                search,
                currentStatus: status,
                currentRole: role,
                stats,
                currentPage: page,
                totalPages: Math.ceil(total / limit) || 1,
                totalItems: total
            });
        } catch (err) {
            console.error('[AdminUserController] Index error:', err);
            req.flash('error', 'Gagal memuat pengguna: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    create(req, res) {
        return res.render('admin/users/create', {
            title: 'Tambah Pengguna Baru'
        });
    },

    async store(req, res) {
        try {
            const { name, email, password, role, is_active } = req.body;
            if (!name || !email || !password || !role) {
                req.flash('error', 'Semua data formulir wajib diisi.');
                return res.redirect('/admin/users/create');
            }

            if (password.trim().length < 8) {
                req.flash('error', 'Password minimal terdiri dari 8 karakter.');
                return res.redirect('/admin/users/create');
            }

            const existing = await db('users').where({ email: email.trim() }).first();
            if (existing) {
                req.flash('error', 'Email sudah digunakan oleh akun lain.');
                return res.redirect('/admin/users/create');
            }

            const hashedPassword = bcrypt.hashSync(password.trim(), 10);
            const activeStatus = is_active === '0' ? 0 : 1;

            const [newId] = await db('users').insert({
                name: name.trim(),
                email: email.trim(),
                password: hashedPassword,
                role: role === 'admin' ? 'admin' : 'user',
                is_active: activeStatus,
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });

            await activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Pembuatan Akun Pengguna Baru',
                description: `Administrator '${req.session.user.name}' membuat akun pengguna baru '${name.trim()}' (${email.trim()}) dengan status ${activeStatus === 1 ? 'Aktif' : 'Dinonaktifkan'}`,
                ipAddress: req.ip,
                status: 'success',
                metadata: { new_user_id: newId, name: name.trim(), email: email.trim(), role }
            });

            req.flash('success', `Pengguna '${name.trim()}' berhasil dibuat!`);
            return res.redirect('/admin/users');
        } catch (err) {
            console.error('[AdminUserController] Store error:', err);
            req.flash('error', 'Gagal membuat pengguna: ' + err.message);
            return res.redirect('/admin/users/create');
        }
    },

    async show(req, res) {
        try {
            const { id } = req.params;
            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            const routers = await db('routers')
                .leftJoin('backups', 'routers.id', 'backups.router_id')
                .where('routers.user_id', id)
                .select(
                    'routers.*',
                    db.raw('COUNT(backups.id) as backups_count'),
                    db.raw('COALESCE(SUM(backups.file_size), 0) as total_size')
                )
                .groupBy('routers.id')
                .orderBy('routers.created_at', 'desc');

            const totalBackups = routers.reduce((acc, r) => acc + parseInt(r.backups_count || 0, 10), 0);
            const totalStorage = routers.reduce((acc, r) => acc + parseInt(r.total_size || 0, 10), 0);

            return res.render('admin/users/show', {
                title: `Detail Pengguna - ${targetUser.name}`,
                user: targetUser,
                routers,
                totalBackups,
                totalStorage
            });
        } catch (err) {
            console.error('[AdminUserController] Show error:', err);
            req.flash('error', err.message);
            return res.redirect('/admin/users');
        }
    },

    async edit(req, res) {
        try {
            const { id } = req.params;
            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            return res.render('admin/users/edit', {
                title: `Edit Pengguna: ${targetUser.name}`,
                targetUser
            });
        } catch (err) {
            req.flash('error', err.message);
            return res.redirect('/admin/users');
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, email, password, role, is_active } = req.body;

            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            // Cannot deactivate or demote own account
            if (parseInt(id, 10) === req.session.user.id && (is_active === '0' || role !== 'admin')) {
                req.flash('error', 'Anda tidak dapat mengubah status atau peran akun Anda sendiri.');
                return res.redirect(`/admin/users/${id}/edit`);
            }

            const updateData = {
                name: name.trim(),
                email: email.trim(),
                role: role === 'admin' ? 'admin' : 'user',
                is_active: is_active === '1' || is_active === 'on' || is_active === 1 ? 1 : 0,
                updated_at: db.fn.now()
            };

            if (password && password.trim().length >= 8) {
                updateData.password = bcrypt.hashSync(password.trim(), 10);
            }

            await db('users').where('id', id).update(updateData);

            await activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Pembaruan Data Pengguna',
                description: `Administrator '${req.session.user.name}' memperbarui data akun '${name.trim()}' (${email.trim()})`,
                ipAddress: req.ip,
                status: 'info',
                metadata: { target_user_id: id, name: name.trim(), email: email.trim(), role, is_active: updateData.is_active }
            });

            req.flash('success', `Data pengguna '${name}' berhasil diperbarui.`);
            return res.redirect('/admin/users');
        } catch (err) {
            console.error('[AdminUserController] Update error:', err);
            req.flash('error', 'Gagal memperbarui pengguna: ' + err.message);
            return res.redirect(`/admin/users/${req.params.id}/edit`);
        }
    },

    async toggleStatus(req, res) {
        try {
            const { id } = req.params;
            if (parseInt(id, 10) === req.session.user.id) {
                req.flash('error', 'Anda tidak dapat menonaktifkan akun Anda sendiri.');
                return res.redirect('/admin/users');
            }

            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            const currentStatus = targetUser.is_active === 0 ? 0 : 1;
            const newStatus = currentStatus === 1 ? 0 : 1;

            await db('users').where('id', id).update({
                is_active: newStatus,
                updated_at: db.fn.now()
            });

            const statusText = newStatus === 1 ? 'Aktif' : 'Dinonaktifkan (Suspended)';

            await activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: newStatus === 1 ? 'Aktivasi Akun Pengguna' : 'Penonaktifan Akun Pengguna (Suspend)',
                description: `Administrator '${req.session.user.name}' mengubah status akun '${targetUser.name}' (${targetUser.email}) menjadi ${statusText}`,
                ipAddress: req.ip,
                status: newStatus === 1 ? 'success' : 'warning',
                metadata: { target_user_id: targetUser.id, target_name: targetUser.name, is_active: newStatus }
            });

            req.flash('success', `Status akun '${targetUser.name}' berhasil diubah menjadi ${statusText}.`);
            return res.redirect('/admin/users');
        } catch (err) {
            console.error('[AdminUserController] Toggle status error:', err);
            req.flash('error', 'Gagal mengubah status pengguna: ' + err.message);
            return res.redirect('/admin/users');
        }
    },

    async resetPassword(req, res) {
        try {
            const { id } = req.params;
            const { new_password } = req.body;

            if (!new_password || new_password.trim().length < 8) {
                req.flash('error', 'Password baru minimal harus 8 karakter.');
                return res.redirect('/admin/users');
            }

            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            const hashedPassword = bcrypt.hashSync(new_password.trim(), 10);
            await db('users').where('id', id).update({
                password: hashedPassword,
                updated_at: db.fn.now()
            });

            await activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Reset Password Pengguna',
                description: `Administrator '${req.session.user.name}' me-reset password akun '${targetUser.name}' (${targetUser.email})`,
                ipAddress: req.ip,
                status: 'info',
                metadata: { target_user_id: targetUser.id, target_name: targetUser.name }
            });

            req.flash('success', `Password untuk pengguna '${targetUser.name}' berhasil diperbarui.`);
            return res.redirect('/admin/users');
        } catch (err) {
            console.error('[AdminUserController] Reset password error:', err);
            req.flash('error', 'Gagal mereset password pengguna: ' + err.message);
            return res.redirect('/admin/users');
        }
    },

    async destroy(req, res) {
        try {
            const { id } = req.params;
            if (parseInt(id, 10) === req.session.user.id) {
                req.flash('error', 'Anda tidak dapat menghapus akun Anda sendiri.');
                return res.redirect('/admin/users');
            }

            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            await db('users').where('id', id).delete();

            await activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Penghapusan Akun Pengguna',
                description: `Administrator '${req.session.user.name}' menghapus akun pengguna '${targetUser.name}' (${targetUser.email})`,
                ipAddress: req.ip,
                status: 'warning',
                metadata: { deleted_user_id: id, name: targetUser.name, email: targetUser.email }
            });

            req.flash('success', `Pengguna '${targetUser.name}' berhasil dihapus.`);
            return res.redirect('/admin/users');
        } catch (err) {
            console.error('[AdminUserController] Destroy error:', err);
            req.flash('error', 'Gagal menghapus pengguna: ' + err.message);
            return res.redirect('/admin/users');
        }
    },

    async impersonate(req, res) {
        try {
            const { id } = req.params;
            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            if (targetUser.is_active === 0 || targetUser.is_active === false) {
                req.flash('error', 'Tidak dapat melakukan impersonasi pada akun yang sedang dinonaktifkan (suspended).');
                return res.redirect('/admin/users');
            }

            activityLogService.log({
                userId: req.session.user.id,
                type: 'impersonate',
                action: 'Mulai Impersonasi Tenant',
                description: `Administrator '${req.session.user.name}' (#${req.session.user.id}) memulai impersonasi ke akun tenant '${targetUser.name}' (#${targetUser.id})`,
                ipAddress: req.ip,
                status: 'warning'
            });

            req.session.impersonatorId = req.session.user.id;
            req.session.user = {
                id: targetUser.id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role
            };

            req.flash('info', `Mode impersonasi aktif. Anda sekarang login sebagai ${targetUser.name}.`);
            return res.redirect('/dashboard');
        } catch (err) {
            req.flash('error', 'Gagal melakukan impersonasi: ' + err.message);
            return res.redirect('/admin/users');
        }
    },

    async leaveImpersonate(req, res) {
        try {
            if (!req.session.impersonatorId) {
                return res.redirect('/dashboard');
            }

            const originalAdmin = await db('users').where('id', req.session.impersonatorId).first();
            const impersonatedUserName = req.session.user ? req.session.user.name : 'Unknown';
            delete req.session.impersonatorId;

            if (originalAdmin) {
                req.session.user = {
                    id: originalAdmin.id,
                    name: originalAdmin.name,
                    email: originalAdmin.email,
                    role: originalAdmin.role
                };

                activityLogService.log({
                    userId: originalAdmin.id,
                    type: 'impersonate',
                    action: 'Selesai Impersonasi Tenant',
                    description: `Administrator '${originalAdmin.name}' mengakhiri impersonasi dari akun '${impersonatedUserName}' dan kembali ke sesi Admin`,
                    ipAddress: req.ip,
                    status: 'info'
                });
            }

            req.flash('success', 'Kembali ke sesi Administrator Anda.');
            return res.redirect('/admin/users');
        } catch (err) {
            delete req.session.impersonatorId;
            return res.redirect('/dashboard');
        }
    }
};
