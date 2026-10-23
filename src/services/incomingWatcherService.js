const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const backupQueueService = require('./backupQueueService');

class IncomingWatcherService {
    constructor() {
        this.incomingDir = path.join(process.cwd(), 'storage', 'incoming');
        this.interval = null;
        this.processing = new Set();
        this.fileSizes = new Map();
    }

    start() {
        if (!fs.existsSync(this.incomingDir)) {
            fs.mkdirSync(this.incomingDir, { recursive: true });
        }

        console.log(`[Incoming Watcher] Monitoring folder: ${this.incomingDir}`);

        // Scan every 5 seconds for newly arrived files (e.g. from SFTP / SCP / FTP)
        this.interval = setInterval(() => {
            this.scanDirectory().catch(err => {
                console.error('[Incoming Watcher] Scan error:', err.message);
            });
        }, 5000);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }

    async scanDirectory() {
        if (!fs.existsSync(this.incomingDir)) return;

        const files = fs.readdirSync(this.incomingDir);
        for (const file of files) {
            const filePath = path.join(this.incomingDir, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) continue;

                const ext = path.extname(file).toLowerCase().replace('.', '');
                if (!['backup', 'rsc'].includes(ext)) continue;

                // Check stability (make sure file upload has finished writing)
                const lastSize = this.fileSizes.get(filePath);
                if (lastSize === undefined || lastSize !== stat.size) {
                    this.fileSizes.set(filePath, stat.size);
                    continue; // Wait for next tick to verify file size doesn't change
                }

                // File size is stable, process it
                if (this.processing.has(filePath)) continue;
                this.processing.add(filePath);

                await this.processFile(file, filePath, stat.size, ext);
                this.fileSizes.delete(filePath);
                this.processing.delete(filePath);
            } catch (e) {
                this.processing.delete(filePath);
            }
        }
    }

    async processFile(filename, filePath, fileSize, type) {
        try {
            console.log(`[Incoming Watcher] Processing stable file: ${filename} (${fileSize} bytes)`);

            // Extract router name from filename e.g. "OLT-SALAMANJAH-20261023.backup" -> "OLT-SALAMANJAH"
            const nameWithoutExt = path.basename(filename, path.extname(filename));
            // Remove trailing date timestamp like -20261023 or _20261023
            const candidateName = nameWithoutExt.replace(/[-_]\d{6,14}$/, '').trim();

            // Find matching router in database
            let router = await db('routers')
                .whereRaw('LOWER(name) = ?', [candidateName.toLowerCase()])
                .first();

            if (!router) {
                // Try finding by prefix match
                router = await db('routers')
                    .whereRaw('LOWER(?) LIKE CONCAT("%", LOWER(name), "%")', [nameWithoutExt])
                    .first();
            }

            if (!router) {
                // Fallback to first router in database if only one exists
                const count = await db('routers').count('* as total').first();
                if (count && count.total === 1) {
                    router = await db('routers').first();
                }
            }

            if (!router) {
                console.warn(`[Incoming Watcher] Could not match router for file '${filename}' (Candidate: '${candidateName}').`);
                return;
            }

            console.log(`[Incoming Watcher] Matched file '${filename}' to router '${router.name}' (ID: ${router.id})`);

            await backupQueueService.enqueue({
                router,
                type,
                file: {
                    path: filePath,
                    originalname: filename,
                    size: fileSize
                },
                clientFilename: filename
            });

            // Clean original file if still present
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
        } catch (err) {
            console.error(`[Incoming Watcher] Error processing '${filename}':`, err.message);
        }
    }
}

module.exports = new IncomingWatcherService();
