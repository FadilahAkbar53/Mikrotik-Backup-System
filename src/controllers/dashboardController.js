const db = require('../config/database');
const dayjs = require('dayjs');

function formatBytes(bytes) {
    const b = parseInt(bytes, 10) || 0;
    if (b <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return parseFloat((b / Math.pow(1024, i)).toFixed(2)) + ' ' + (units[i] || 'B');
}

async function executeWithRetry(fn, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isConnReset = err.code === 'ECONNRESET' ||
                                err.code === 'PROTOCOL_CONNECTION_LOST' ||
                                err.code === 'ETIMEDOUT' ||
                                err.message?.includes('ECONNRESET');
            if (isConnReset && attempt < maxRetries) {
                console.warn(`[DB Retry] Transient connection error (${err.code || err.message}), retrying attempt ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 300));
                continue;
            }
            throw err;
        }
    }
}

module.exports = {
    async index(req, res) {
        try {
            const user = req.session.user;
            return await executeWithRetry(async () => {
                if (user.role === 'admin') {
                    return await adminDashboard(req, res);
                }
                return await userDashboard(req, res, user);
            });
        } catch (err) {
            console.error('Dashboard error:', err);
            req.flash('error', 'Gagal memuat dashboard: ' + err.message);
            return res.render('dashboard/user', {
                title: 'Dashboard',
                routers: [],
                totalRouters: 0,
                healthyCount: 0,
                failedCount: 0,
                totalBackups: 0,
                totalSizeFormatted: '0 B',
                chartData: {
                    trendLabels: [],
                    trendCounts: [],
                    trendSizes: [],
                    rscCount: 0,
                    rscFormatted: '0 B',
                    binaryCount: 0,
                    binaryFormatted: '0 B'
                },
                recentBackups: []
            });
        }
    }
};

async function adminDashboard(req, res) {
    const threshold = dayjs().subtract(24, 'hour').format('YYYY-MM-DD HH:mm:ss');
    const sevenDaysAgo = dayjs().subtract(6, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');

    const [uRow, rStats, bStats, dailyRows, typeRows] = await Promise.all([
        db('users').count('* as count').first(),
        db('routers').select(
            db.raw('COUNT(*) as total_routers'),
            db.raw('COUNT(CASE WHEN last_backup_time IS NULL OR last_backup_time < ? THEN 1 END) as failed_routers', [threshold])
        ).first(),
        db('backups').select(
            db.raw('COUNT(*) as total_backups'),
            db.raw('COALESCE(SUM(file_size), 0) as total_bytes')
        ).first(),
        db('backups')
            .where('created_at', '>=', sevenDaysAgo)
            .select(
                db.raw('DATE(created_at) as date'),
                db.raw('COUNT(*) as count'),
                db.raw('COALESCE(SUM(file_size), 0) as total_size')
            )
            .groupByRaw('DATE(created_at)'),
        db('backups')
            .select(
                'file_type',
                db.raw('COUNT(*) as count'),
                db.raw('COALESCE(SUM(file_size), 0) as total_size')
            )
            .groupBy('file_type')
    ]);

    const totalUsers = parseInt(uRow.count, 10) || 0;
    const totalRouters = parseInt(rStats.total_routers, 10) || 0;
    const failedRoutersCount = parseInt(rStats.failed_routers, 10) || 0;
    const healthyRoutersCount = Math.max(0, totalRouters - failedRoutersCount);
    const totalBackups = parseInt(bStats.total_backups, 10) || 0;
    const totalSizeBytes = parseInt(bStats.total_bytes, 10) || 0;
    const totalSizeFormatted = formatBytes(totalSizeBytes);

    // Build 7-day trend
    const trendDates = [];
    const trendLabels = [];
    for (let i = 6; i >= 0; i--) {
        const d = dayjs().subtract(i, 'day');
        trendDates.push(d.format('YYYY-MM-DD'));
        trendLabels.push(d.format('DD MMM'));
    }

    const dailyMap = new Map();
    for (const row of dailyRows) {
        const dateKey = dayjs(row.date).format('YYYY-MM-DD');
        dailyMap.set(dateKey, {
            count: parseInt(row.count, 10) || 0,
            total_size: parseInt(row.total_size, 10) || 0
        });
    }

    const trendCounts = trendDates.map(date => dailyMap.get(date)?.count || 0);
    const trendSizes = trendDates.map(date => {
        const b = dailyMap.get(date)?.total_size || 0;
        return parseFloat((b / 1024).toFixed(2)); // in KB
    });

    let rscCount = 0;
    let rscSizeBytes = 0;
    let binaryCount = 0;
    let binarySizeBytes = 0;

    for (const row of typeRows) {
        const count = parseInt(row.count, 10) || 0;
        const size = parseInt(row.total_size, 10) || 0;
        if (row.file_type === 'rsc') {
            rscCount = count;
            rscSizeBytes = size;
        } else {
            binaryCount += count;
            binarySizeBytes += size;
        }
    }

    const chartData = {
        trendLabels,
        trendCounts,
        trendSizes,
        rscCount,
        rscFormatted: formatBytes(rscSizeBytes),
        binaryCount,
        binaryFormatted: formatBytes(binarySizeBytes),
        healthyRoutersCount,
        failedRoutersCount
    };

    const recentBackups = await db('backups')
        .join('routers', 'backups.router_id', 'routers.id')
        .leftJoin('users', 'routers.user_id', 'users.id')
        .select(
            'backups.*',
            'routers.name as router_name',
            'users.name as owner_name',
            'users.email as owner_email'
        )
        .orderBy('backups.created_at', 'desc')
        .limit(10);

    const problemRouters = await db('routers')
        .leftJoin('users', 'routers.user_id', 'users.id')
        .where(function() {
            this.whereNull('routers.last_backup_time')
                .orWhere('routers.last_backup_time', '<', threshold);
        })
        .select(
            'routers.*',
            'users.name as owner_name',
            'users.email as owner_email'
        )
        .orderBy('routers.updated_at', 'desc')
        .limit(10);

    return res.render('dashboard/admin', {
        title: 'Admin Dashboard',
        totalUsers,
        totalRouters,
        totalBackups,
        totalSizeFormatted,
        healthyRoutersCount,
        failedRoutersCount,
        chartData,
        recentBackups,
        problemRouters
    });
}

async function userDashboard(req, res, user) {
    const threshold = dayjs().subtract(24, 'hour');

    const routers = await db('routers')
        .leftJoin('backups', 'routers.id', 'backups.router_id')
        .where('routers.user_id', user.id)
        .select(
            'routers.*',
            db.raw('COUNT(backups.id) as backups_count')
        )
        .groupBy('routers.id')
        .orderBy('routers.created_at', 'desc');

    const totalRouters = routers.length;
    let healthyCount = 0;
    let failedCount = 0;

    for (const r of routers) {
        const isHealthy = r.last_backup_time && dayjs(r.last_backup_time).isAfter(threshold);
        r.is_healthy = isHealthy;
        if (isHealthy) healthyCount++;
        else failedCount++;
    }

    const routerIds = routers.map(r => r.id);
    let totalBackups = 0;
    let totalSizeFormatted = '0 B';
    let recentBackups = [];

    const trendDates = [];
    const trendLabels = [];
    for (let i = 6; i >= 0; i--) {
        const d = dayjs().subtract(i, 'day');
        trendDates.push(d.format('YYYY-MM-DD'));
        trendLabels.push(d.format('DD MMM'));
    }

    let trendCounts = trendDates.map(() => 0);
    let trendSizes = trendDates.map(() => 0);
    let rscCount = 0;
    let rscFormatted = '0 B';
    let binaryCount = 0;
    let binaryFormatted = '0 B';

    if (routerIds.length > 0) {
        const sevenDaysAgo = dayjs().subtract(6, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const [bStatsRow, dailyRows, typeRows, recents] = await Promise.all([
            db('backups')
                .whereIn('router_id', routerIds)
                .select(
                    db.raw('COUNT(*) as total_backups'),
                    db.raw('COALESCE(SUM(file_size), 0) as total_bytes')
                )
                .first(),
            db('backups')
                .whereIn('router_id', routerIds)
                .where('created_at', '>=', sevenDaysAgo)
                .select(
                    db.raw('DATE(created_at) as date'),
                    db.raw('COUNT(*) as count'),
                    db.raw('COALESCE(SUM(file_size), 0) as total_size')
                )
                .groupByRaw('DATE(created_at)'),
            db('backups')
                .whereIn('router_id', routerIds)
                .select(
                    'file_type',
                    db.raw('COUNT(*) as count'),
                    db.raw('COALESCE(SUM(file_size), 0) as total_size')
                )
                .groupBy('file_type'),
            db('backups')
                .join('routers', 'backups.router_id', 'routers.id')
                .whereIn('backups.router_id', routerIds)
                .select('backups.*', 'routers.name as router_name')
                .orderBy('backups.created_at', 'desc')
                .limit(8)
        ]);

        totalBackups = parseInt(bStatsRow?.total_backups, 10) || 0;
        const totalBytes = parseInt(bStatsRow?.total_bytes, 10) || 0;
        totalSizeFormatted = formatBytes(totalBytes);
        recentBackups = recents || [];

        const dailyMap = new Map();
        for (const row of dailyRows) {
            const dateKey = dayjs(row.date).format('YYYY-MM-DD');
            dailyMap.set(dateKey, {
                count: parseInt(row.count, 10) || 0,
                total_size: parseInt(row.total_size, 10) || 0
            });
        }

        trendCounts = trendDates.map(date => dailyMap.get(date)?.count || 0);
        trendSizes = trendDates.map(date => {
            const b = dailyMap.get(date)?.total_size || 0;
            return parseFloat((b / 1024).toFixed(2));
        });

        let rscSizeBytes = 0;
        let binarySizeBytes = 0;
        for (const row of typeRows) {
            const count = parseInt(row.count, 10) || 0;
            const size = parseInt(row.total_size, 10) || 0;
            if (row.file_type === 'rsc') {
                rscCount = count;
                rscSizeBytes = size;
            } else {
                binaryCount += count;
                binarySizeBytes += size;
            }
        }
        rscFormatted = formatBytes(rscSizeBytes);
        binaryFormatted = formatBytes(binarySizeBytes);
    }

    const chartData = {
        trendLabels,
        trendCounts,
        trendSizes,
        rscCount,
        rscFormatted,
        binaryCount,
        binaryFormatted,
        healthyCount,
        failedCount
    };

    return res.render('dashboard/user', {
        title: 'Dashboard Router',
        routers,
        totalRouters,
        healthyCount,
        failedCount,
        totalBackups,
        totalSizeFormatted,
        chartData,
        recentBackups
    });
}