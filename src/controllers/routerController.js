const db = require('../config/database');
const crypto = require('crypto');
const scriptService = require('../services/scriptService');
const retentionService = require('../services/retentionService');

module.exports = {
    async index(req, res) {
        try {
            const user = req.session.user;
            const search = (req.query.search || req.query.q || '').trim();
            const page = parseInt(req.query.page, 10) || 1;
            const limit = 15;
            const offset = (page - 1) * limit;

            let query = db('routers')
                .leftJoin('users', 'routers.user_id', 'users.id')
                .leftJoin('backups', 'routers.id', 'backups.router_id');

            if (user.role !== 'admin') {
                query = query.where('routers.user_id', user.id);
            }

            if (search) {
                query = query.where(function() {
                    this.where('routers.name', 'like', `%${search}%`)
                        .orWhere('routers.api_token', 'like', `%${search}%`)
                        .orWhere('users.name', 'like', `%${search}%`)
                        .orWhere('users.email', 'like', `%${search}%`);
                });
            }

            const totalRow = await query.clone().countDistinct('routers.id as count').first();
            const total = parseInt(totalRow.count, 10) || 0;

            const routers = await query.clone()
                .select(
                    'routers.*',
                    'users.name as owner_name',
                    'users.email as owner_email',
                    db.raw('COUNT(backups.id) as backups_count'),
                    db.raw('COALESCE(SUM(backups.file_size), 0) as total_size')
                )
                .groupBy('routers.id')
                .orderBy('routers.created_at', 'desc')
                .limit(limit)
                .offset(offset);

            return res.render('routers/index', {
                title: 'Daftar Router',
                routers,
                currentPage: page,
                totalPages: Math.ceil(total / limit) || 1,
                totalItems: total,
                search
            });
        } catch (err) {
            console.error('Routers index error:', err);
            req.flash('error', 'Gagal memuat daftar router: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    create(req, res) {
        return res.render('routers/create', {
            title: 'Tambah Router Baru'
        });
    },

    async store(req, res) {
        try {
            const { name } = req.body;
            if (!name || !name.trim()) {
                req.flash('error', 'Nama router wajib diisi.');
                return res.redirect('/routers/create');
            }

            const token = crypto.randomBytes(16).toString('hex');
            const [id] = await db('routers').insert({
                user_id: req.session.user.id,
                name: name.trim(),
                api_token: token,
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });

            req.flash('success', `Router '${name}' berhasil ditambahkan! Silakan pasang script backup pada MikroTik Anda.`);
            return res.redirect(`/routers/${id}?tab=script`);
        } catch (err) {
            console.error('Store router error:', err);
            req.flash('error', 'Gagal menambahkan router: ' + err.message);
            return res.redirect('/routers/create');
        }
    },

    async show(req, res) {
        try {
            const { id } = req.params;
            const user = req.session.user;
            const tab = req.query.tab || 'overview';
            const page = parseInt(req.query.page, 10) || 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const router = await db('routers')
                .leftJoin('users', 'routers.user_id', 'users.id')
                .where('routers.id', id)
                .select('routers.*', 'users.name as owner_name', 'users.email as owner_email')
                .first();

            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            const search = (req.query.search || req.query.q || '').trim();

            // Total backups & size
            const statsRow = await db('backups')
                .where('router_id', id)
                .select(
                    db.raw('COUNT(*) as total_backups'),
                    db.raw('COALESCE(SUM(file_size), 0) as total_size')
                )
                .first();

            const overallTotalBackups = parseInt(statsRow.total_backups, 10) || 0;
            const totalSize = parseInt(statsRow.total_size, 10) || 0;

            // Sorting parameters for tab=backups (nama berkas, tipe, waktu backup)
            const sort = (req.query.sort || 'time').toLowerCase();
            const order = (req.query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

            let sortColumn = 'created_at';
            if (sort === 'name') {
                sortColumn = 'file_path';
            } else if (sort === 'type') {
                sortColumn = 'file_type';
            } else if (sort === 'time') {
                sortColumn = 'created_at';
            }

            let backupQuery = db('backups').where('router_id', id);
            if (search) {
                backupQuery = backupQuery.where(function() {
                    this.where('file_path', 'like', `%${search}%`)
                        .orWhere('file_type', 'like', `%${search}%`);
                });
            }

            const countRow = await backupQuery.clone().count('id as count').first();
            const totalFilteredBackups = parseInt(countRow.count, 10) || 0;

            // Paginated backups for tab=backups
            const backups = await backupQuery.clone()
                .orderBy(sortColumn, order)
                .orderBy('id', order)
                .limit(limit)
                .offset(offset);

            // Active templates for tab=script
            const templates = await scriptService.getActiveTemplates();
            const selectedTemplateId = parseInt(req.query.template_id, 10) || (templates[0] ? templates[0].id : null);
            const activeTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0] || null;

            const interval = req.query.interval || '1d';
            const startTime = req.query.start_time || '02:00:00';

            const generatedScript = activeTemplate
                ? scriptService.generateScript(router, activeTemplate.content || activeTemplate.script_content, { interval, startTime, appUrl: res.locals.appUrl })
                : '';

            return res.render('routers/show', {
                title: `Router: ${router.name}`,
                router,
                tab,
                totalBackups: search ? totalFilteredBackups : overallTotalBackups,
                overallTotalBackups,
                totalSize,
                totalSizeFormatted: retentionService.formatBytes(totalSize),
                backups,
                currentPage: page,
                totalPages: Math.ceil((search ? totalFilteredBackups : overallTotalBackups) / limit) || 1,
                templates,
                selectedTemplateId,
                activeTemplate,
                interval,
                startTime,
                generatedScript,
                sort,
                order,
                search
            });
        } catch (err) {
            console.error('Router show error:', err);
            req.flash('error', 'Gagal memuat detail router: ' + err.message);
            return res.redirect('/routers');
        }
    },

    async edit(req, res) {
        try {
            const { id } = req.params;
            const user = req.session.user;

            const router = await db('routers').where('id', id).first();
            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            return res.render('routers/edit', {
                title: `Edit Router: ${router.name}`,
                router
            });
        } catch (err) {
            req.flash('error', err.message);
            return res.redirect('/routers');
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name } = req.body;
            const user = req.session.user;

            const router = await db('routers').where('id', id).first();
            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            if (!name || !name.trim()) {
                req.flash('error', 'Nama router tidak boleh kosong.');
                return res.redirect(`/routers/${id}/edit`);
            }

            await db('routers').where('id', id).update({
                name: name.trim(),
                updated_at: db.fn.now()
            });

            req.flash('success', 'Nama router berhasil diperbarui.');
            return res.redirect(`/routers/${id}`);
        } catch (err) {
            req.flash('error', 'Gagal memperbarui router: ' + err.message);
            return res.redirect(`/routers/${req.params.id}/edit`);
        }
    },

    async destroy(req, res) {
        try {
            const { id } = req.params;
            const user = req.session.user;

            const router = await db('routers').where('id', id).first();
            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            // Delete physical backup files
            const backups = await db('backups').where('router_id', id);
            for (const b of backups) {
                retentionService.deletePhysicalFile(b.file_path);
            }

            await db('backups').where('router_id', id).delete();
            await db('routers').where('id', id).delete();

            req.flash('success', `Router '${router.name}' dan seluruh berkas backup-nya berhasil dihapus.`);
            return res.redirect('/routers');
        } catch (err) {
            req.flash('error', 'Gagal menghapus router: ' + err.message);
            return res.redirect('/routers');
        }
    },

    async regenerateToken(req, res) {
        try {
            const { id } = req.params;
            const user = req.session.user;

            const router = await db('routers').where('id', id).first();
            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            const newToken = crypto.randomBytes(16).toString('hex');
            await db('routers').where('id', id).update({
                api_token: newToken,
                updated_at: db.fn.now()
            });

            req.flash('success', 'API Token berhasil diperbarui! Jangan lupa perbarui token di script MikroTik Anda.');
            return res.redirect(`/routers/${id}?tab=script`);
        } catch (err) {
            req.flash('error', 'Gagal meregenerasi token: ' + err.message);
            return res.redirect(`/routers/${req.params.id}`);
        }
    }
};