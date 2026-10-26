const fs = require('fs');
const os = require('os');
const net = require('net');
const db = require('../config/database');

class ServerHealthService {
    /**
     * Check if local FTP port is listening
     */
    async checkFtpStatus() {
        const ftpPort = parseInt(process.env.FTP_PORT || '2121', 10);
        const startTime = Date.now();

        return new Promise((resolve) => {
            const socket = new net.Socket();
            let isResolved = false;

            socket.setTimeout(1200);

            socket.on('connect', () => {
                const latency = Date.now() - startTime;
                socket.destroy();
                if (!isResolved) {
                    isResolved = true;
                    resolve({
                        status: 'online',
                        port: ftpPort,
                        latency,
                        message: `Aktif & Mendengarkan di Port ${ftpPort}`
                    });
                }
            });

            socket.on('timeout', () => {
                socket.destroy();
                if (!isResolved) {
                    isResolved = true;
                    resolve({
                        status: 'warning',
                        port: ftpPort,
                        latency: null,
                        message: `Port ${ftpPort} Timeout (> 1.2s)`
                    });
                }
            });

            socket.on('error', (err) => {
                socket.destroy();
                if (!isResolved) {
                    isResolved = true;
                    resolve({
                        status: 'offline',
                        port: ftpPort,
                        latency: null,
                        message: `Port ${ftpPort} Tidak Merespon: ${err.message}`
                    });
                }
            });

            socket.connect(ftpPort, '127.0.0.1');
        });
    }

    /**
     * Get disk storage stats of the storage directory
     */
    getDiskUsage() {
        try {
            const storagePath = process.cwd();
            const stats = fs.statfsSync(storagePath);
            const total = stats.bsize * stats.blocks;
            const free = stats.bsize * stats.bavail;
            const used = total - free;
            const percentUsed = total > 0 ? ((used / total) * 100) : 0;

            let status = 'normal';
            if (percentUsed >= 90) {
                status = 'danger';
            } else if (percentUsed >= 80) {
                status = 'warning';
            }

            return {
                totalBytes: total,
                usedBytes: used,
                freeBytes: free,
                percentUsed: parseFloat(percentUsed.toFixed(1)),
                totalFormatted: this.formatBytes(total),
                usedFormatted: this.formatBytes(used),
                freeFormatted: this.formatBytes(free),
                status
            };
        } catch (err) {
            console.error('[ServerHealthService] Disk usage check failed:', err.message);
            return {
                totalBytes: 0,
                usedBytes: 0,
                freeBytes: 0,
                percentUsed: 0,
                totalFormatted: 'N/A',
                usedFormatted: 'N/A',
                freeFormatted: 'N/A',
                status: 'unknown'
            };
        }
    }

    /**
     * Check MySQL database connection latency & tables
     */
    async checkDatabaseHealth() {
        const start = Date.now();
        try {
            await db.raw('SELECT 1');
            const latency = Date.now() - start;

            // Fetch table counts
            const [routerCount] = await db('routers').count('id as c');
            const [backupCount] = await db('backups').count('id as c');
            const [userCount] = await db('users').count('id as c');

            return {
                status: 'online',
                latency,
                message: 'Terhubung Normal',
                stats: {
                    routers: routerCount ? routerCount.c : 0,
                    backups: backupCount ? backupCount.c : 0,
                    users: userCount ? userCount.c : 0
                }
            };
        } catch (err) {
            return {
                status: 'offline',
                latency: null,
                message: `Koneksi Database Gagal: ${err.message}`,
                stats: { routers: 0, backups: 0, users: 0 }
            };
        }
    }

    /**
     * Get system & retention background status
     */
    async getSystemStatus() {
        const uptimeSeconds = process.uptime();
        const uptimeFormatted = this.formatUptime(uptimeSeconds);

        let retentionSettings = {};
        try {
            const rows = await db('system_settings').whereIn('key', [
                'retention_auto_prune_enabled',
                'retention_last_pruned_at',
                'retention_last_pruned_count',
                'retention_last_pruned_bytes'
            ]);
            rows.forEach(r => {
                retentionSettings[r.key] = r.value;
            });
        } catch (err) {
            console.error('[ServerHealthService] Failed to load retention settings:', err.message);
        }

        const memUsage = process.memoryUsage();

        return {
            uptime: uptimeFormatted,
            nodeVersion: process.version,
            platform: `${os.type()} (${os.arch()})`,
            memoryRss: this.formatBytes(memUsage.rss),
            memoryHeap: this.formatBytes(memUsage.heapUsed),
            retention: {
                autoPruneEnabled: retentionSettings['retention_auto_prune_enabled'] === '1',
                lastPrunedAt: retentionSettings['retention_last_pruned_at'] || null,
                lastPrunedCount: parseInt(retentionSettings['retention_last_pruned_count'] || '0', 10),
                lastPrunedBytes: parseInt(retentionSettings['retention_last_pruned_bytes'] || '0', 10),
                lastPrunedFormatted: this.formatBytes(parseInt(retentionSettings['retention_last_pruned_bytes'] || '0', 10))
            }
        };
    }

    /**
     * Aggregate full health report
     */
    async getFullHealthReport() {
        const [ftp, dbHealth, system] = await Promise.all([
            this.checkFtpStatus(),
            this.checkDatabaseHealth(),
            this.getSystemStatus()
        ]);
        const disk = this.getDiskUsage();

        return {
            ftp,
            disk,
            database: dbHealth,
            system,
            timestamp: new Date()
        };
    }

    formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    formatUptime(seconds) {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        const parts = [];
        if (d > 0) parts.push(`${d} hari`);
        if (h > 0) parts.push(`${h} jam`);
        if (m > 0) parts.push(`${m} mnt`);
        if (parts.length === 0) parts.push(`${s} dtk`);
        return parts.join(' ');
    }
}

module.exports = new ServerHealthService();
