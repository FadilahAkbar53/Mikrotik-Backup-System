const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dayjs = require('dayjs');
const db = require('../config/database');
const retentionService = require('./retentionService');
const voucherReportService = require('./voucherReportService');
const activityLogService = require('./activityLogService');

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function executeDbWithRetry(fn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isConnReset = err.code === 'ECONNRESET' ||
                                err.code === 'PROTOCOL_CONNECTION_LOST' ||
                                err.code === 'ETIMEDOUT' ||
                                err.message?.includes('ECONNRESET');
            if (isConnReset && attempt < maxRetries) {
                console.warn(`[BackupQueue DB] Transient error (${err.code || err.message}), retry ${attempt}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                continue;
            }
            throw err;
        }
    }
}

class BackupQueueService {
    constructor() {
        this.baseQueueDir = path.join(process.cwd(), 'storage', 'queue');
        this.stagingDir = path.join(this.baseQueueDir, 'staging');
        this.pendingDir = path.join(this.baseQueueDir, 'pending');
        this.failedDir = path.join(this.baseQueueDir, 'failed');

        this.concurrency = parseInt(process.env.BACKUP_QUEUE_CONCURRENCY || '2', 10) || 2;
        this.activeWorkers = 0;
        this.queue = [];
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // Ensure directories exist
        [this.baseQueueDir, this.stagingDir, this.pendingDir, this.failedDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        this.initialized = true;
        this.recoverPendingJobs();
    }

    recoverPendingJobs() {
        try {
            const files = fs.readdirSync(this.pendingDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.pendingDir, file);
                    try {
                        const raw = fs.readFileSync(filePath, 'utf8');
                        const job = JSON.parse(raw);
                        if (fs.existsSync(job.stagedFilePath)) {
                            console.log(`[BackupQueue] Recovered unfinished job ${job.jobId} from disk.`);
                            this.queue.push(job);
                        } else {
                            // Staged file missing, remove stale pending record
                            fs.unlinkSync(filePath);
                        }
                    } catch (e) {
                        console.error(`[BackupQueue] Failed to parse pending job ${file}:`, e.message);
                    }
                }
            }
            if (this.queue.length > 0) {
                console.log(`[BackupQueue] Starting processing for ${this.queue.length} recovered job(s)...`);
                this.processNext();
            }
        } catch (err) {
            console.error('[BackupQueue] Recovery error:', err.message);
        }
    }

    async enqueue({ router, type, file, rawBody, clientFilename }) {
        this.init();

        const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const routerFolder = slugify(router.name) || `router_${router.id}`;
        
        let originalName = clientFilename || `backup_${routerFolder}.${type}`;
        if (file && file.originalname) {
            originalName = file.originalname;
        }
        const cleanName = originalName.replace(/[^a-zA-Z0-9_\.-]/g, '_');
        const stagedFileName = `${jobId}_${cleanName}`;
        const stagedFilePath = path.join(this.stagingDir, stagedFileName);

        let fileSize = 0;

        // Save file immediately to staging area
        if (file && file.path) {
            fs.copyFileSync(file.path, stagedFilePath);
            try { fs.unlinkSync(file.path); } catch (e) {}
            fileSize = fs.statSync(stagedFilePath).size;
        } else if (rawBody && (Buffer.isBuffer(rawBody) || typeof rawBody === 'string')) {
            fs.writeFileSync(stagedFilePath, rawBody);
            fileSize = fs.statSync(stagedFilePath).size;
        } else {
            throw new Error('No valid payload received to enqueue');
        }

        const job = {
            jobId,
            routerId: router.id,
            routerName: router.name,
            userId: router.user_id,
            type,
            cleanName,
            stagedFilePath,
            fileSize,
            enqueuedAt: new Date().toISOString(),
            attempts: 0
        };

        // Write descriptor for crash durability
        const descriptorPath = path.join(this.pendingDir, `${jobId}.json`);
        fs.writeFileSync(descriptorPath, JSON.stringify(job, null, 2), 'utf8');

        // Push into in-memory queue
        this.queue.push(job);
        console.log(`[BackupQueue] Enqueued job ${jobId} for router '${router.name}' (${type.toUpperCase()}, ${fileSize} bytes). Pending: ${this.queue.length}`);

        // Trigger processing in background
        setImmediate(() => this.processNext());

        return {
            jobId,
            filename: cleanName,
            fileSize,
            type,
            queuePosition: this.queue.length
        };
    }

    async processNext() {
        if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.activeWorkers++;
        const job = this.queue.shift();

        try {
            await this.processJob(job);
        } catch (err) {
            console.error(`[BackupQueue] Error processing job ${job.jobId}:`, err.message);
            job.attempts = (job.attempts || 0) + 1;

            if (job.attempts < 3) {
                console.log(`[BackupQueue] Retrying job ${job.jobId} (attempt ${job.attempts + 1})...`);
                this.queue.push(job);
            } else {
                console.error(`[BackupQueue] Job ${job.jobId} permanently failed after 3 attempts.`);
                const failPath = path.join(this.failedDir, `${job.jobId}.json`);
                fs.writeFileSync(failPath, JSON.stringify({ ...job, error: err.message, failedAt: new Date().toISOString() }, null, 2), 'utf8');
                const pendingPath = path.join(this.pendingDir, `${job.jobId}.json`);
                if (fs.existsSync(pendingPath)) fs.unlinkSync(pendingPath);
            }
        } finally {
            this.activeWorkers--;
            // Process remaining items in queue
            setImmediate(() => this.processNext());
        }
    }

    async processJob(job) {
        const now = dayjs();
        const year = now.format('YYYY');
        const month = now.format('MM');
        const routerFolder = slugify(job.routerName) || `router_${job.routerId}`;

        const relativeDir = path.join('storage', 'backups', `user_${job.userId}`, routerFolder, year, month);
        const absoluteDir = path.join(process.cwd(), relativeDir);

        if (!fs.existsSync(absoluteDir)) {
            fs.mkdirSync(absoluteDir, { recursive: true });
        }

        const finalFilename = `${now.format('YYYYMMDD_HHmmss')}_${job.cleanName}`;
        const finalDestPath = path.join(absoluteDir, finalFilename);

        // Move from staging to permanent storage
        if (fs.existsSync(job.stagedFilePath)) {
            fs.copyFileSync(job.stagedFilePath, finalDestPath);
            try { fs.unlinkSync(job.stagedFilePath); } catch (e) {}
        } else {
            throw new Error(`Staged file not found at ${job.stagedFilePath}`);
        }

        const relativeSavedPath = path.join(relativeDir, finalFilename).replace(/\\/g, '/');
        const finalSize = fs.existsSync(finalDestPath) ? fs.statSync(finalDestPath).size : job.fileSize;

        let insertedId = null;
        // 1. Insert into database
        await executeDbWithRetry(async () => {
            const [id] = await db('backups').insert({
                router_id: job.routerId,
                file_type: job.type,
                file_path: relativeSavedPath,
                file_size: finalSize,
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });
            insertedId = id;

            await db('routers').where('id', job.routerId).update({
                last_backup_time: db.fn.now(),
                updated_at: db.fn.now()
            });
        });

        // 2. Retention auto-prune & Same-Day Replacement (background non-blocking)
        try {
            // Replace any previous backup from today for this router and file type
            await retentionService.pruneSameDayDuplicates(job.routerId, job.type, now.toDate(), insertedId);

            const autoPrune = await retentionService.getSetting('retention_auto_prune_enabled', true);
            const pruneOnUpload = await retentionService.getSetting('retention_prune_on_upload', true);
            if (autoPrune && pruneOnUpload) {
                await retentionService.pruneRouterMonth(job.routerId, parseInt(year, 10), parseInt(month, 10));
            }
        } catch (pruneErr) {
            console.warn(`[BackupQueue Prune] Pruning notice for router ${job.routerId}:`, pruneErr.message);
        }

        // 3. Remove descriptor from pending directory
        const descriptorPath = path.join(this.pendingDir, `${job.jobId}.json`);
        if (fs.existsSync(descriptorPath)) {
            fs.unlinkSync(descriptorPath);
        }

        // 4. Auto-sync Hotspot Voucher Report if RSC file
        if (job.type === 'rsc') {
            voucherReportService.syncFromRscFile(job.routerId, finalDestPath).catch(syncErr => {
                console.warn(`[VoucherReport AutoSync] Error syncing vouchers for router ${job.routerId}:`, syncErr.message);
            });
        }

        activityLogService.log({
            userId: job.userId,
            routerId: job.routerId,
            type: 'backup',
            action: `Backup .${job.type.toUpperCase()} Tersimpan`,
            description: `Berkas ${job.type === 'backup' ? 'Binary (.backup)' : 'Export Script (.rsc)'} dari router '${job.routerName}' berhasil diverifikasi dan disimpan ke storage (${(finalSize / 1024 / 1024).toFixed(2)} MB)`,
            status: 'success',
            metadata: { file_path: relativeSavedPath, file_size: finalSize, file_type: job.type }
        });

        console.log(`[BackupQueue] Completed job ${job.jobId} -> ${relativeSavedPath} (${finalSize} bytes). Remaining in queue: ${this.queue.length}`);
    }

    getStats() {
        return {
            pending: this.queue.length,
            activeWorkers: this.activeWorkers,
            concurrency: this.concurrency
        };
    }
}

module.exports = new BackupQueueService();
