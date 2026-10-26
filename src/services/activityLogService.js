const db = require('../config/database');

class ActivityLogService {
    /**
     * Log an activity or system event
     * @param {Object} data
     * @param {number|null} data.userId
     * @param {number|null} data.routerId
     * @param {string} data.type - 'ftp_upload', 'ftp_error', 'api_upload', 'auth', 'impersonate', 'router', 'backup', 'retention', 'system'
     * @param {string} data.action - e.g. 'Upload FTP Berhasil', 'Login Berhasil', etc.
     * @param {string} data.description - Detailed explanation
     * @param {string|null} data.ipAddress - IP of client / router
     * @param {string} data.status - 'success', 'info', 'warning', 'error'
     * @param {Object|null} data.metadata - Additional data
     */
    async log({ userId = null, routerId = null, type = 'system', action, description = '', ipAddress = null, status = 'info', metadata = null }) {
        try {
            await db('activity_logs').insert({
                user_id: userId,
                router_id: routerId,
                type,
                action,
                description,
                ip_address: ipAddress,
                status,
                metadata: metadata ? JSON.stringify(metadata) : null,
                created_at: new Date()
            });
        } catch (err) {
            console.error('[ActivityLogService] Failed to record log:', err.message);
        }
    }

    /**
     * Get paginated logs with filters
     */
    async getLogs({ page = 1, limit = 20, type = '', status = '', search = '' } = {}) {
        let query = db('activity_logs')
            .leftJoin('users', 'activity_logs.user_id', 'users.id')
            .leftJoin('routers', 'activity_logs.router_id', 'routers.id')
            .select(
                'activity_logs.*',
                'users.name as user_name',
                'users.email as user_email',
                'routers.name as router_name'
            );

        if (type && type !== 'all') {
            query = query.where('activity_logs.type', type);
        }

        if (status && status !== 'all') {
            query = query.where('activity_logs.status', status);
        }

        if (search) {
            query = query.where(function() {
                this.where('activity_logs.action', 'like', `%${search}%`)
                    .orWhere('activity_logs.description', 'like', `%${search}%`)
                    .orWhere('activity_logs.ip_address', 'like', `%${search}%`)
                    .orWhere('routers.name', 'like', `%${search}%`)
                    .orWhere('users.name', 'like', `%${search}%`);
            });
        }

        const countQuery = query.clone().clearSelect().count({ total: 'activity_logs.id' }).first();
        const countRes = await countQuery;
        const total = countRes ? countRes.total : 0;

        const offset = (page - 1) * limit;
        const logs = await query.orderBy('activity_logs.id', 'desc').offset(offset).limit(limit);

        return {
            logs,
            total,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Get recent logs for Admin Dashboard
     */
    async getRecentLogs(limit = 8) {
        return await db('activity_logs')
            .leftJoin('users', 'activity_logs.user_id', 'users.id')
            .leftJoin('routers', 'activity_logs.router_id', 'routers.id')
            .select(
                'activity_logs.*',
                'users.name as user_name',
                'routers.name as router_name'
            )
            .orderBy('activity_logs.id', 'desc')
            .limit(limit);
    }

    /**
     * Clear logs older than X days
     */
    async pruneOldLogs(days = 30) {
        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return await db('activity_logs').where('created_at', '<', threshold).del();
    }
}

module.exports = new ActivityLogService();
