const db = require('../config/database');
const backupQueueService = require('../services/backupQueueService');

module.exports = {
    async upload(req, res) {
        try {
            // 1. Resolve token
            let token = req.body?.token || req.query?.token || req.headers['x-router-token'];
            if (!token && req.headers.authorization) {
                const parts = req.headers.authorization.split(' ');
                if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                    token = parts[1];
                }
            }

            if (!token) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Parameter "token" is required.'
                });
            }

            // 2. Authenticate router & verify owner account status
            const router = await db('routers')
                .leftJoin('users', 'routers.user_id', 'users.id')
                .select('routers.*', 'users.is_active as user_is_active')
                .where({ 'routers.api_token': token })
                .first();

            if (!router) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid or unrecognized router API token.'
                });
            }

            if (router.user_is_active === 0 || router.user_is_active === false) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Router owner account is suspended.'
                });
            }

            // 3. Resolve and validate file type ('rsc' or 'backup')
            const type = (req.body?.type || req.query?.type || '').toLowerCase();
            if (!['rsc', 'backup'].includes(type)) {
                return res.status(422).json({
                    status: 'error',
                    message: 'Parameter "type" must be either "rsc" or "backup".'
                });
            }

            // 4. Verify file payload exists
            const hasFile = !!req.file;
            const hasRawBody = req.body && (typeof req.body === 'string' || Buffer.isBuffer(req.body));
            if (!hasFile && !hasRawBody) {
                return res.status(422).json({
                    status: 'error',
                    message: 'No backup file payload was received.'
                });
            }

            const clientFilename = req.query?.filename || req.headers['x-filename'] || null;

            // 5. Enqueue job immediately into the Queue Service (Offloads DB and Disk from HTTP thread)
            const queuedJob = await backupQueueService.enqueue({
                router,
                type,
                file: req.file,
                rawBody: hasRawBody ? req.body : null,
                clientFilename
            });

            // 6. Fast Response (< 50ms) to MikroTik RouterOS
            return res.status(200).json({
                status: 'success',
                message: 'Backup file received and queued for processing.',
                data: {
                    job_id: queuedJob.jobId,
                    router_id: router.id,
                    router_name: router.name,
                    filename: queuedJob.filename,
                    size: queuedJob.fileSize,
                    type: type,
                    queue_position: queuedJob.queuePosition,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            console.error('API Backup Upload Error:', err);
            return res.status(500).json({
                status: 'error',
                message: 'Internal server error processing backup upload: ' + err.message
            });
        }
    }
};