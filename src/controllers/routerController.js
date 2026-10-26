const db = require('../config/database');
const crypto = require('crypto');
const dayjs = require('dayjs');
const scriptService = require('../services/scriptService');
const retentionService = require('../services/retentionService');
const voucherReportService = require('../services/voucherReportService');
const settingService = require('../services/settingService');
const activityLogService = require('../services/activityLogService');

module.exports = {
    async index(req, res) {
        try {
            const user = req.session.user;
            const search = (req.query.search || req.query.q || '').trim();
            const status = (req.query.status || 'all').trim();
            const userId = (req.query.userId || req.query.user_id || 'all').trim();
            const sort = (req.query.sort || 'created_desc').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 15));
            const offset = (page - 1) * limit;

            const [kpis, tenants, { query, threshold, healthThresholdHours }] = await Promise.all([
                getRouterKPIs(user),
                user.role === 'admin'
                    ? db('users').select('id', 'name', 'email').orderBy('name', 'asc')
                    : Promise.resolve([]),
                buildRouterQuery(user, { search, status, userId, sort })
            ]);

            const countQuery = query.clone().clearSelect().clearOrder().countDistinct('routers.id as count').first();
            const countRow = await countQuery;
            const total = parseInt(countRow ? countRow.count : 0, 10) || 0;

            const routers = await query
                .limit(limit)
                .offset(offset);

            return res.render('routers/index', {
                title: 'Daftar Router MikroTik',
                routers,
                currentPage: page,
                totalPages: Math.ceil(total / limit) || 1,
                totalItems: total,
                limit,
                search,
                currentStatus: status,
                currentUserId: userId,
                currentSort: sort,
                kpis,
                tenants,
                healthThresholdHours,
                threshold
            });
        } catch (err) {
            console.error('[RouterController] Index error:', err);
            req.flash('error', 'Gagal memuat daftar router: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    async exportData(req, res) {
        try {
            const user = req.session.user;
            const search = (req.query.search || req.query.q || '').trim();
            const status = (req.query.status || 'all').trim();
            const userId = (req.query.userId || req.query.user_id || 'all').trim();
            const sort = (req.query.sort || 'created_desc').trim();
            const format = (req.query.format || 'csv').trim().toLowerCase();

            const { query, threshold } = await buildRouterQuery(user, { search, status, userId, sort });
            const routers = await query;

            if (format === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="mikback_routers_${dayjs().format('YYYYMMDD_HHmmss')}.json"`);
                return res.json({
                    exported_at: new Date(),
                    total: routers.length,
                    routers: routers.map(r => ({
                        id: r.id,
                        name: r.name,
                        ip_address: r.ip_address || '',
                        api_token: r.api_token,
                        owner_name: r.owner_name || '',
                        owner_email: r.owner_email || '',
                        last_backup_time: r.last_backup_time,
                        backups_count: r.backups_count,
                        total_size_bytes: r.total_size,
                        created_at: r.created_at
                    }))
                });
            }

            // CSV Export with UTF-8 BOM
            const filename = `mikback_routers_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            let csv = '\uFEFF';
            csv += 'No,ID Router,Nama Router,Pemilik (Tenant),Email Pemilik,IP Address,API Token,Status Kesehatan,Terakhir Sukses Backup,Total File Backup,Total Ukuran (MB),Tanggal Didaftarkan\n';

            routers.forEach((r, idx) => {
                const isHealthy = r.last_backup_time && dayjs(r.last_backup_time).isAfter(dayjs(threshold));
                const statusText = !r.last_backup_time ? 'Belum Pernah' : (isHealthy ? 'Sehat' : 'Perlu Perhatian');
                const lastBackup = r.last_backup_time ? dayjs(r.last_backup_time).format('YYYY-MM-DD HH:mm:ss') : 'Belum Ada';
                const sizeMB = (parseInt(r.total_size || 0, 10) / (1024 * 1024)).toFixed(2);
                const createdAt = dayjs(r.created_at).format('YYYY-MM-DD HH:mm:ss');

                const clean = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

                csv += [
                    idx + 1,
                    r.id,
                    clean(r.name),
                    clean(r.owner_name || '-'),
                    clean(r.owner_email || '-'),
                    clean(r.ip_address || '-'),
                    clean(r.api_token || '-'),
                    clean(statusText),
                    clean(lastBackup),
                    r.backups_count,
                    sizeMB,
                    clean(createdAt)
                ].join(',') + '\n';
            });

            return res.send(csv);
        } catch (err) {
            console.error('[RouterController] Export error:', err);
            req.flash('error', 'Gagal mengekspor data router: ' + err.message);
            return res.redirect('/routers');
        }
    },

    async bulkDelete(req, res) {
        try {
            const user = req.session.user;
            let ids = req.body.router_ids || req.body['router_ids[]'];
            if (!ids) {
                req.flash('error', 'Tidak ada router yang dipilih untuk dihapus.');
                return res.redirect('/routers');
            }

            if (!Array.isArray(ids)) {
                ids = [ids];
            }
            ids = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);

            if (ids.length === 0) {
                req.flash('error', 'Pilihan router tidak valid.');
                return res.redirect('/routers');
            }

            let routerQuery = db('routers').whereIn('id', ids);
            if (user.role !== 'admin') {
                routerQuery = routerQuery.where('user_id', user.id);
            }

            const targetRouters = await routerQuery;
            if (targetRouters.length === 0) {
                req.flash('error', 'Tidak ada router yang diizinkan untuk dihapus.');
                return res.redirect('/routers');
            }

            const validIds = targetRouters.map(r => r.id);

            // Fetch and delete all backup files on disk
            const backups = await db('backups').whereIn('router_id', validIds);
            for (const b of backups) {
                retentionService.deletePhysicalFile(b.file_path);
            }

            await db('backups').whereIn('router_id', validIds).delete();
            await db('routers').whereIn('id', validIds).delete();

            await activityLogService.log({
                userId: user.id,
                type: 'router',
                action: 'Hapus Massal Router',
                description: `Pengguna '${user.name}' menghapus ${validIds.length} router secara massal (${targetRouters.map(r => r.name).join(', ')})`,
                ipAddress: req.ip,
                status: 'warning',
                metadata: { deleted_ids: validIds, router_names: targetRouters.map(r => r.name) }
            });

            req.flash('success', `Berhasil menghapus ${validIds.length} router terpilih beserta seluruh berkas fisiknya.`);
            return res.redirect('/routers');
        } catch (err) {
            console.error('[RouterController] Bulk delete error:', err);
            req.flash('error', 'Gagal memproses penghapusan massal: ' + err.message);
            return res.redirect('/routers');
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

            // Active templates for tab=script (default to all-in-one scheduler)
            const templates = await scriptService.getActiveTemplates();
            const allInOneTpl = templates.find(t => t.slug === 'one_click_setup');
            const defaultTplId = allInOneTpl ? allInOneTpl.id : (templates[0] ? templates[0].id : null);
            const selectedTemplateId = parseInt(req.query.template_id, 10) || defaultTplId;
            const activeTemplate = templates.find(t => t.id === selectedTemplateId) || allInOneTpl || templates[0] || null;

            const interval = req.query.interval || '1d';
            const startTime = req.query.start_time || '02:00:00';

            const generatedScript = activeTemplate
                ? scriptService.generateScript(router, activeTemplate.content || activeTemplate.script_content, { interval, startTime, appUrl: res.locals.appUrl })
                : '';

            let reportData = null;
            if (tab === 'reports') {
                const reportMonth = (req.query.month || '').trim();
                const reportProfile = (req.query.profile || '').trim();
                const reportSearch = (req.query.report_search || req.query.q || '').trim();
                const reportPage = Math.max(1, parseInt(req.query.report_page, 10) || 1);
                const reportLimit = 15;
                const reportFilters = { month: reportMonth, profile: reportProfile, search: reportSearch };

                const [
                    reportSummary,
                    reportMonthly,
                    reportProfiles,
                    reportDaily,
                    reportTransactions,
                    availableMonths,
                    availableProfiles
                ] = await Promise.all([
                    voucherReportService.getReportSummary(id, reportFilters),
                    voucherReportService.getMonthlyBreakdown(id, { profile: reportProfile }),
                    voucherReportService.getProfileBreakdown(id, { month: reportMonth }),
                    voucherReportService.getDailyBreakdown(id, reportFilters, 31),
                    voucherReportService.getTransactions(id, reportFilters, reportPage, reportLimit),
                    voucherReportService.getAvailableMonths(id),
                    voucherReportService.getAvailableProfiles(id)
                ]);

                reportData = {
                    summary: reportSummary,
                    monthlyBreakdown: reportMonthly,
                    profileBreakdown: reportProfiles,
                    dailyBreakdown: reportDaily,
                    transactions: reportTransactions.transactions,
                    totalTransactions: reportTransactions.total,
                    currentPage: reportPage,
                    totalPages: reportTransactions.totalPages,
                    availableMonths,
                    availableProfiles,
                    filters: reportFilters
                };
            }

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
                search,
                reportData
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
    },

    async manualUpload(req, res) {
        try {
            const { id } = req.params;
            const user = req.session.user;

            const router = await db('routers').where({ id }).first();
            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Anda tidak memiliki hak akses untuk router ini.');
                return res.redirect('/routers');
            }

            if (!req.file) {
                req.flash('error', 'Silakan pilih berkas backup (.rsc atau .backup) terlebih dahulu.');
                return res.redirect(`/routers/${id}?tab=backups`);
            }

            const originalName = req.file.originalname.toLowerCase();
            let type = null;
            if (originalName.endsWith('.rsc')) {
                type = 'rsc';
            } else if (originalName.endsWith('.backup')) {
                type = 'backup';
            }

            if (!type) {
                req.flash('error', 'Format berkas tidak didukung. Harap unggah berkas berekstensi .backup atau .rsc.');
                return res.redirect(`/routers/${id}?tab=backups`);
            }

            const backupQueueService = require('../services/backupQueueService');
            await backupQueueService.enqueue({
                router,
                type,
                file: req.file,
                clientFilename: req.file.originalname
            });

            // Allow quick processing
            await new Promise(resolve => setTimeout(resolve, 600));

            await activityLogService.log({
                userId: user.id,
                routerId: router.id,
                type: 'backup',
                action: 'Unggah Backup Manual',
                description: `Pengguna '${user.name}' mengunggah berkas backup manual '${req.file.originalname}' (${(req.file.size / 1024 / 1024).toFixed(2)} MB) untuk router '${router.name}'`,
                ipAddress: req.ip,
                status: 'success'
            });

            req.flash('success', `Berkas backup '${req.file.originalname}' berhasil diunggah dan disimpan ke penyimpanan cloud.`);
            return res.redirect(`/routers/${id}?tab=backups`);
        } catch (err) {
            console.error('[RouterController] Manual upload error:', err);
            req.flash('error', 'Gagal memproses unggahan backup: ' + err.message);
            return res.redirect(`/routers/${req.params.id}?tab=backups`);
        }
    }
};

async function buildRouterQuery(user, { search = '', status = 'all', userId = 'all', sort = 'created_desc' } = {}) {
    const healthThresholdHours = await settingService.getNumber('health_threshold_hours', 24);
    const threshold = dayjs().subtract(healthThresholdHours, 'hour').format('YYYY-MM-DD HH:mm:ss');

    let query = db('routers')
        .leftJoin('users', 'routers.user_id', 'users.id')
        .leftJoin('backups', 'routers.id', 'backups.router_id');

    // Scoping for non-admin
    if (user.role !== 'admin') {
        query = query.where('routers.user_id', user.id);
    } else if (userId && userId !== 'all') {
        query = query.where('routers.user_id', parseInt(userId, 10));
    }

    // Status filter
    if (status === 'healthy') {
        query = query.whereNotNull('routers.last_backup_time')
                     .where('routers.last_backup_time', '>=', threshold);
    } else if (status === 'late') {
        query = query.where(function() {
            this.whereNull('routers.last_backup_time')
                .orWhere('routers.last_backup_time', '<', threshold);
        });
    } else if (status === 'never') {
        query = query.whereNull('routers.last_backup_time');
    }

    // Keyword search
    if (search) {
        query = query.where(function() {
            this.where('routers.name', 'like', `%${search}%`)
                .orWhere('routers.api_token', 'like', `%${search}%`)
                .orWhere('routers.ip_address', 'like', `%${search}%`)
                .orWhere('users.name', 'like', `%${search}%`)
                .orWhere('users.email', 'like', `%${search}%`);
        });
    }

    // Select with aggregates
    query = query.select(
        'routers.*',
        'users.name as owner_name',
        'users.email as owner_email',
        db.raw('COUNT(backups.id) as backups_count'),
        db.raw('COALESCE(SUM(backups.file_size), 0) as total_size')
    ).groupBy('routers.id');

    // Sorting
    switch (sort) {
        case 'created_asc':
            query = query.orderBy('routers.created_at', 'asc');
            break;
        case 'backup_desc':
            query = query.orderByRaw('routers.last_backup_time IS NULL ASC, routers.last_backup_time DESC');
            break;
        case 'backup_asc':
            query = query.orderByRaw('routers.last_backup_time IS NULL DESC, routers.last_backup_time ASC');
            break;
        case 'name_asc':
            query = query.orderBy('routers.name', 'asc');
            break;
        case 'name_desc':
            query = query.orderBy('routers.name', 'desc');
            break;
        case 'files_desc':
            query = query.orderByRaw('COUNT(backups.id) DESC');
            break;
        case 'created_desc':
        default:
            query = query.orderBy('routers.created_at', 'desc');
            break;
    }

    return { query, threshold, healthThresholdHours };
}

async function getRouterKPIs(user) {
    const healthThresholdHours = await settingService.getNumber('health_threshold_hours', 24);
    const threshold = dayjs().subtract(healthThresholdHours, 'hour').format('YYYY-MM-DD HH:mm:ss');

    let baseQuery = db('routers');
    if (user.role !== 'admin') {
        baseQuery = baseQuery.where('routers.user_id', user.id);
    }

    const row = await baseQuery.clone().select(
        db.raw('COUNT(*) as total_routers'),
        db.raw('COUNT(CASE WHEN last_backup_time IS NOT NULL AND last_backup_time >= ? THEN 1 END) as healthy_routers', [threshold]),
        db.raw('COUNT(CASE WHEN last_backup_time IS NULL OR last_backup_time < ? THEN 1 END) as late_routers', [threshold]),
        db.raw('COUNT(CASE WHEN last_backup_time IS NULL THEN 1 END) as never_routers', [])
    ).first();

    let backupQuery = db('backups');
    if (user.role !== 'admin') {
        backupQuery = backupQuery.join('routers', 'backups.router_id', 'routers.id')
                                 .where('routers.user_id', user.id);
    }
    const backupRow = await backupQuery.count('backups.id as total_backups').first();

    return {
        total: parseInt(row?.total_routers || '0', 10),
        healthy: parseInt(row?.healthy_routers || '0', 10),
        late: parseInt(row?.late_routers || '0', 10),
        never: parseInt(row?.never_routers || '0', 10),
        totalBackups: parseInt(backupRow?.total_backups || '0', 10),
        healthThresholdHours
    };
}