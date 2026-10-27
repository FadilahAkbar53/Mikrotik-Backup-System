const db = require('../config/database');
const voucherReportService = require('../services/voucherReportService');

const reportController = {
    /**
     * Display Voucher Report Dashboard
     */
    async index(req, res) {
        try {
            const user = req.session.user;

            // Load routers accessible by user
            let routersQuery = db('routers')
                .leftJoin('users', 'routers.user_id', 'users.id')
                .select('routers.id', 'routers.name', 'routers.user_id', 'routers.last_backup_time', 'users.name as owner_name')
                .orderBy('routers.name', 'asc');

            if (user.role !== 'admin') {
                routersQuery = routersQuery.where('routers.user_id', user.id);
            }

            const routers = await routersQuery;

            if (!routers || routers.length === 0) {
                return res.render('reports/index', {
                    title: 'Laporan Voucher Hotspot',
                    routers: [],
                    selectedRouter: null,
                    selectedRouterId: null,
                    summary: {
                        totalRevenue: 0,
                        totalRevenueFormatted: 'Rp 0',
                        totalVouchers: 0,
                        totalProfiles: 0,
                        activeDays: 0,
                        avgDailyRevenueFormatted: 'Rp 0'
                    },
                    monthlyBreakdown: [],
                    profileBreakdown: [],
                    dailyBreakdown: [],
                    transactions: [],
                    totalTransactions: 0,
                    currentPage: 1,
                    totalPages: 1,
                    availableMonths: [],
                    availableProfiles: [],
                    filters: { month: '', profile: '', search: '' }
                });
            }

            // Determine selected router
            let selectedRouterId = parseInt(req.query.router_id, 10);
            let selectedRouter = routers.find(r => r.id === selectedRouterId);

            if (!selectedRouter) {
                selectedRouter = routers[0];
                selectedRouterId = selectedRouter.id;
            }

            // Security check: non-admin can only view their own router
            if (user.role !== 'admin' && selectedRouter.user_id !== user.id) {
                req.flash('error', 'Akses ke data router ini ditolak.');
                return res.redirect('/reports');
            }

            // Filter parameters
            const date = (req.query.date || '').trim();
            const month = (req.query.month || '').trim();
            const profile = (req.query.profile || '').trim();
            const search = (req.query.search || req.query.q || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = 20;

            const filters = { date, month, profile, search };

            // Fetch report aggregations
            const [
                summary,
                monthlyBreakdown,
                profileBreakdown,
                dailyBreakdown,
                transactionsData,
                availableMonths,
                availableProfiles
            ] = await Promise.all([
                voucherReportService.getReportSummary(selectedRouterId, filters),
                voucherReportService.getMonthlyBreakdown(selectedRouterId, { profile }),
                voucherReportService.getProfileBreakdown(selectedRouterId, { month }),
                voucherReportService.getDailyBreakdown(selectedRouterId, filters, null),
                voucherReportService.getTransactions(selectedRouterId, filters, page, limit),
                voucherReportService.getAvailableMonths(selectedRouterId),
                voucherReportService.getAvailableProfiles(selectedRouterId)
            ]);

            return res.render('reports/index', {
                title: `Laporan Voucher - ${selectedRouter.name}`,
                routers,
                selectedRouter,
                selectedRouterId,
                summary,
                monthlyBreakdown,
                profileBreakdown,
                dailyBreakdown,
                transactions: transactionsData.transactions,
                totalTransactions: transactionsData.total,
                currentPage: page,
                totalPages: transactionsData.totalPages,
                availableMonths,
                availableProfiles,
                filters
            });
        } catch (err) {
            console.error('[ReportController index] Error:', err);
            req.flash('error', 'Gagal memuat laporan voucher: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    /**
     * Trigger manual sync of voucher report from latest .rsc backup
     */
    async sync(req, res) {
        try {
            const user = req.session.user;
            const routerId = parseInt(req.params.routerId, 10);

            const router = await db('routers').where('id', routerId).first();
            if (!router) {
                req.flash('error', 'Router tidak ditemukan.');
                return res.redirect('/reports');
            }

            if (user.role !== 'admin' && router.user_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/reports');
            }

            const result = await voucherReportService.syncAllRscFiles(routerId);
            
            if (result.newInserted > 0) {
                req.flash('success', `Sinkronisasi berhasil! Memindai ${result.filesProcessed} berkas .rsc, ${result.newInserted} voucher baru berhasil diintegrasikan (total ${result.totalExisting.toLocaleString('id-ID')} voucher tersimpan tanpa duplikasi).`);
            } else {
                req.flash('info', `Sinkronisasi selesai! Memindai ${result.filesProcessed} berkas .rsc. Seluruh riwayat penjualan (${result.totalExisting.toLocaleString('id-ID')} voucher) sudah lengkap dan tersinkronisasi tanpa duplikasi.`);
            }

            const redirectUrl = req.headers.referer || `/reports?router_id=${routerId}`;
            return res.redirect(redirectUrl);
        } catch (err) {
            console.error('[ReportController sync] Error:', err);
            req.flash('error', 'Gagal sinkronisasi laporan voucher: ' + err.message);
            const redirectUrl = req.headers.referer || `/reports?router_id=${req.params.routerId}`;
            return res.redirect(redirectUrl);
        }
    }
};

module.exports = reportController;
