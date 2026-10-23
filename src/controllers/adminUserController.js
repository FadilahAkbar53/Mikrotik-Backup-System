const db = require('../config/database');
const bcrypt = require('bcryptjs');

module.exports = {
    async index(req, res) {
        try {
            const search = req.query.search || '';
            const page = parseInt(req.query.page, 10) || 1;
            const limit = 15;
            const offset = (page - 1) * limit;

            let query = db('users')
                .leftJoin('routers', 'users.id', 'routers.user_id');

            if (search.trim()) {
                query = query.where(function() {
                    this.where('users.name', 'like', `%${search.trim()}%`)
                        .orWhere('users.email', 'like', `%${search.trim()}%`);
                });
            }

            const totalRow = await query.clone().countDistinct('users.id as count').first();
            const total = parseInt(totalRow.count, 10) || 0;

            const users = await query.clone()
                .select(
                    'users.*',
                    db.raw('COUNT(routers.id) as routers_count')
                )
                .groupBy('users.id')
                .orderBy('users.created_at', 'desc')
                .limit(limit)
                .offset(offset);

            return res.render('admin/users/index', {
                title: 'Kelola Pengguna',
                users,
                search,
                currentPage: page,
                totalPages: Math.ceil(total / limit) || 1,
                totalItems: total
            });
        } catch (err) {
            console.error('Users index error:', err);
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
            const { name, email, password, role } = req.body;
            if (!name || !email || !password || !role) {
                req.flash('error', 'Semua data formulir wajib diisi.');
                return res.redirect('/admin/users/create');
            }

            const existing = await db('users').where({ email }).first();
            if (existing) {
                req.flash('error', 'Email sudah digunakan oleh akun lain.');
                return res.redirect('/admin/users/create');
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            await db('users').insert({
                name: name.trim(),
                email: email.trim(),
                password: hashedPassword,
                role: role === 'admin' ? 'admin' : 'user',
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });

            req.flash('success', `Pengguna '${name}' berhasil dibuat!`);
            return res.redirect('/admin/users');
        } catch (err) {
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
                    db.raw('COUNT(backups.id) as backups_count')
                )
                .groupBy('routers.id')
                .orderBy('routers.created_at', 'desc');

            return res.render('admin/users/show', {
                title: `Detail Pengguna - ${targetUser.name}`,
                user: targetUser,
                routers
            });
        } catch (err) {
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
            const { name, email, password, role } = req.body;

            const targetUser = await db('users').where('id', id).first();
            if (!targetUser) {
                req.flash('error', 'Pengguna tidak ditemukan.');
                return res.redirect('/admin/users');
            }

            const updateData = {
                name: name.trim(),
                email: email.trim(),
                role: role === 'admin' ? 'admin' : 'user',
                updated_at: db.fn.now()
            };

            if (password && password.trim().length >= 8) {
                updateData.password = bcrypt.hashSync(password.trim(), 10);
            }

            await db('users').where('id', id).update(updateData);

            req.flash('success', `Data pengguna '${name}' berhasil diperbarui.`);
            return res.redirect('/admin/users');
        } catch (err) {
            req.flash('error', 'Gagal memperbarui pengguna: ' + err.message);
            return res.redirect(`/admin/users/${req.params.id}/edit`);
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

            req.flash('success', `Pengguna '${targetUser.name}' berhasil dihapus.`);
            return res.redirect('/admin/users');
        } catch (err) {
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
            delete req.session.impersonatorId;

            if (originalAdmin) {
                req.session.user = {
                    id: originalAdmin.id,
                    name: originalAdmin.name,
                    email: originalAdmin.email,
                    role: originalAdmin.role
                };
            }

            req.flash('success', 'Kembali ke sesi Administrator Anda.');
            return res.redirect('/admin/users');
        } catch (err) {
            delete req.session.impersonatorId;
            return res.redirect('/dashboard');
        }
    }
};
