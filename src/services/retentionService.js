const db = require('../config/database');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

class RetentionService {
    formatBytes(bytes) {
        const b = parseInt(bytes, 10) || 0;
        if (b <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(b) / Math.log(1024));
        return parseFloat((b / Math.pow(1024, i)).toFixed(2)) + ' ' + (units[i] || 'B');
    }

    async getSetting(key, defaultValue = null) {
        try {
            const row = await db('system_settings').where({ key }).first();
            if (!row) return defaultValue;
            if (row.type === 'integer') return parseInt(row.value, 10);
            if (row.type === 'boolean') return row.value === '1' || row.value === 'true';
            if (row.type === 'json') return JSON.parse(row.value);
            return row.value;
        } catch (e) {
            return defaultValue;
        }
    }

    async setSetting(key, value, type = 'string', description = null) {
        const payloadValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const existing = await db('system_settings').where({ key }).first();
        if (existing) {
            await db('system_settings').where({ key }).update({
                value: payloadValue,
                type,
                description: description || existing.description,
                updated_at: db.fn.now()
            });
        } else {
            await db('system_settings').insert({
                key,
                value: payloadValue,
                type,
                description: description || '',
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });
        }
    }

    deletePhysicalFile(filePath) {
        if (!filePath) return;
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        try {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
            const parentDir = path.dirname(fullPath);
            if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
                fs.rmdirSync(parentDir);
            }
        } catch (err) {
            console.error('Error deleting physical file:', err.message);
        }
    }

    async getStorageOverview() {
        const maxMonths = await this.getSetting('retention_max_months', 4);
        const maxDaysPerMonth = await this.getSetting('retention_max_days_per_month', 7);
        const autoPrune = await this.getSetting('retention_auto_prune_enabled', true);
        const pruneOnUpload = await this.getSetting('retention_prune_on_upload', true);

        const totalRow = await db('backups').select(
            db.raw('COUNT(*) as total_backups'),
            db.raw('COALESCE(SUM(file_size), 0) as total_bytes')
        ).first();

        const totalBackups = parseInt(totalRow.total_backups, 10) || 0;
        const totalBytes = parseInt(totalRow.total_bytes, 10) || 0;

        const cutoffDate = dayjs().subtract(maxMonths - 1, 'month').startOf('month');
        const sixMonthsAgo = dayjs().subtract(5, 'month').startOf('month');

        // Single aggregate query for all 6 months (optimized)
        const monthlyStatsRaw = await db('backups')
            .where('created_at', '>=', sixMonthsAgo.format('YYYY-MM-DD HH:mm:ss'))
            .select(
                db.raw('YEAR(created_at) as yr'),
                db.raw('MONTH(created_at) as mo'),
                db.raw('COUNT(*) as backups_count'),
                db.raw('COALESCE(SUM(file_size), 0) as total_size'),
                db.raw('COUNT(DISTINCT router_id) as routers_count')
            )
            .groupByRaw('YEAR(created_at), MONTH(created_at)');

        const monthlyStatsMap = new Map();
        for (const item of monthlyStatsRaw) {
            const key = String(item.yr).padStart(4, '0') + '-' + String(item.mo).padStart(2, '0');
            monthlyStatsMap.set(key, item);
        }

        const monthsDistribution = [];
        for (let i = 0; i < 6; i++) {
            const mDate = dayjs().subtract(i, 'month');
            const yr = mDate.year();
            const mo = mDate.month() + 1;
            const key = String(yr).padStart(4, '0') + '-' + String(mo).padStart(2, '0');
            const start = mDate.startOf('month');

            const stat = monthlyStatsMap.get(key);
            const count = stat ? parseInt(stat.backups_count, 10) : 0;
            const size = stat ? parseInt(stat.total_size, 10) : 0;
            const routersCount = stat ? parseInt(stat.routers_count, 10) : 0;
            const isRetained = start.isAfter(cutoffDate) || start.isSame(cutoffDate);

            monthsDistribution.push({
                label: mDate.format('MMMM YYYY'),
                year: yr,
                month: mo,
                backups_count: count,
                routers_count: routersCount,
                size_bytes: size,
                size_formatted: this.formatBytes(size),
                is_retained: isRetained,
                status_badge: isRetained ? 'Aktif' : 'Kedaluwarsa'
            });
        }

        // Router breakdown using SQL aggregations
        const routersBreakdown = await db('routers')
            .leftJoin('users', 'routers.user_id', 'users.id')
            .leftJoin('backups', 'routers.id', 'backups.router_id')
            .select(
                'routers.id',
                'routers.name',
                'users.name as owner_name',
                db.raw('COUNT(backups.id) as backups_count'),
                db.raw('COALESCE(SUM(backups.file_size), 0) as total_size'),
                db.raw('MAX(backups.created_at) as newest_backup'),
                db.raw('MIN(backups.created_at) as oldest_backup')
            )
            .groupBy('routers.id', 'routers.name', 'users.name')
            .orderBy('total_size', 'desc');

        const formattedBreakdown = routersBreakdown.map(r => ({
            id: r.id,
            name: r.name,
            owner: r.owner_name || 'N/A',
            backups_count: parseInt(r.backups_count, 10) || 0,
            total_size: parseInt(r.total_size, 10) || 0,
            total_size_formatted: this.formatBytes(r.total_size),
            oldest_backup: r.oldest_backup ? dayjs(r.oldest_backup).format('DD MMM YYYY') : '—',
            newest_backup: r.newest_backup ? dayjs(r.newest_backup).format('DD MMM YYYY') : '—'
        }));

        const lastPrunedAt = await this.getSetting('retention_last_pruned_at', null);
        const lastPrunedCount = await this.getSetting('retention_last_pruned_count', 0);
        const lastPrunedBytes = await this.getSetting('retention_last_pruned_bytes', 0);

        return {
            total_backups: totalBackups,
            total_size_bytes: totalBytes,
            total_size_formatted: this.formatBytes(totalBytes),
            max_months: maxMonths,
            max_days_per_month: maxDaysPerMonth,
            auto_prune_enabled: autoPrune,
            prune_on_upload: pruneOnUpload,
            cutoff_date_formatted: cutoffDate.format('DD MMM YYYY'),
            last_pruned_at: lastPrunedAt,
            last_pruned_count: lastPrunedCount,
            last_pruned_bytes: lastPrunedBytes,
            last_pruned_bytes_formatted: this.formatBytes(lastPrunedBytes),
            months_distribution: monthsDistribution,
            routers_breakdown: formattedBreakdown
        };
    }

    async pruneRouterMonth(routerId, year, month, dryRun = false) {
        const maxDaysPerMonth = await this.getSetting('retention_max_days_per_month', 7);
        const startDate = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month');
        const endDate = startDate.endOf('month');

        const backups = await db('backups')
            .where('router_id', routerId)
            .whereBetween('created_at', [startDate.format('YYYY-MM-DD HH:mm:ss'), endDate.format('YYYY-MM-DD HH:mm:ss')])
            .orderBy('created_at', 'desc');

        if (!backups.length) return [];

        const uniqueDates = [];
        for (const b of backups) {
            const d = dayjs(b.created_at).format('YYYY-MM-DD');
            if (!uniqueDates.includes(d)) uniqueDates.push(d);
        }

        if (uniqueDates.length <= maxDaysPerMonth) return [];

        const expiredDates = uniqueDates.slice(maxDaysPerMonth);
        const router = await db('routers').where('id', routerId).first();
        const pruned = [];

        for (const b of backups) {
            const d = dayjs(b.created_at).format('YYYY-MM-DD');
            if (expiredDates.includes(d)) {
                pruned.push({
                    backup_id: b.id,
                    router_id: routerId,
                    router_name: router ? router.name : 'Router #' + routerId,
                    filename: path.basename(b.file_path),
                    file_size: parseInt(b.file_size, 10) || 0,
                    created_at: dayjs(b.created_at).format('YYYY-MM-DD HH:mm:ss'),
                    reason: `Rotasi kuota bulanan (Menyimpan ${maxDaysPerMonth} hari terbaru, tanggal ${dayjs(b.created_at).format('DD MMM')} digantikan backup baru)`
                });

                if (!dryRun) {
                    this.deletePhysicalFile(b.file_path);
                    await db('backups').where('id', b.id).delete();
                }
            }
        }

        return pruned;
    }

    async pruneAll(dryRun = false) {
        const maxMonths = await this.getSetting('retention_max_months', 4);
        const maxDaysPerMonth = await this.getSetting('retention_max_days_per_month', 7);
        const cutoffDate = dayjs().subtract(maxMonths - 1, 'month').startOf('month');

        const allPruned = [];

        // 1. Prune backups older than 4 months
        const expiredBackups = await db('backups')
            .join('routers', 'backups.router_id', 'routers.id')
            .where('backups.created_at', '<', cutoffDate.format('YYYY-MM-DD HH:mm:ss'))
            .select('backups.*', 'routers.name as router_name');

        for (const b of expiredBackups) {
            allPruned.push({
                backup_id: b.id,
                router_id: b.router_id,
                router_name: b.router_name,
                filename: path.basename(b.file_path),
                file_size: parseInt(b.file_size, 10) || 0,
                created_at: dayjs(b.created_at).format('YYYY-MM-DD HH:mm:ss'),
                reason: `Melebihi batas retensi global (> ${maxMonths} bulan)`
            });

            if (!dryRun) {
                this.deletePhysicalFile(b.file_path);
                await db('backups').where('id', b.id).delete();
            }
        }

        // 2. Prune per router within active months
        const routers = await db('routers').select('id');
        for (const r of routers) {
            for (let i = 0; i < maxMonths; i++) {
                const mDate = dayjs().subtract(i, 'month');
                const yr = mDate.year();
                const mo = mDate.month() + 1;
                const monthlyPruned = await this.pruneRouterMonth(r.id, yr, mo, dryRun);
                allPruned.push(...monthlyPruned);
            }
        }

        const totalBytes = allPruned.reduce((sum, item) => sum + (item.file_size || 0), 0);

        if (!dryRun) {
            await this.setSetting('retention_last_pruned_at', dayjs().format('YYYY-MM-DD HH:mm:ss'), 'string');
            await this.setSetting('retention_last_pruned_count', allPruned.length, 'integer');
            await this.setSetting('retention_last_pruned_bytes', totalBytes, 'integer');
        }

        return {
            dry_run: dryRun,
            max_months: maxMonths,
            max_days_per_month: maxDaysPerMonth,
            cutoff_date: cutoffDate.format('DD MMM YYYY'),
            total_files_pruned: allPruned.length,
            total_bytes_saved: totalBytes,
            total_bytes_saved_formatted: this.formatBytes(totalBytes),
            details: allPruned
        };
    }
}

module.exports = new RetentionService();