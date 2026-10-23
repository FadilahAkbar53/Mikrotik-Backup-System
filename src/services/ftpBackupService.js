const FtpSrv = require('ftp-srv');
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const db = require('../config/database');
const backupQueueService = require('./backupQueueService');

class RouterFtpFileSystem extends FtpSrv.FileSystem {
    constructor(connection, { root, cwd, router }) {
        super(connection, { root, cwd });
        this.router = router;
    }

    write(fileName, options = {}) {
        const result = super.write(fileName, options);
        const { fsPath } = this._resolvePath(fileName);
        const baseName = path.basename(fileName);

        result.stream.on('finish', async () => {
            try {
                // Ensure file exists and has size
                if (!fs.existsSync(fsPath)) return;
                const stats = fs.statSync(fsPath);
                if (stats.size === 0) return;

                const ext = path.extname(baseName).toLowerCase().replace('.', '');
                const type = ext === 'backup' ? 'backup' : 'rsc';

                console.log(`[FTP Server] Upload completed for router '${this.router.name}': ${baseName} (${stats.size} bytes)`);

                // Enqueue backup job for atomic processing, moving to storage, DB record, and retention pruning
                await backupQueueService.enqueue({
                    router: this.router,
                    type,
                    file: {
                        path: fsPath,
                        originalname: baseName,
                        size: stats.size
                    },
                    clientFilename: baseName
                });
            } catch (err) {
                console.error(`[FTP Server] Error handling uploaded file '${baseName}':`, err.message);
            }
        });

        return result;
    }
}

class FtpBackupService {
    constructor() {
        this.server = null;
        this.isRunning = false;
        this.tempDir = path.join(process.cwd(), 'storage', 'temp_ftp');
    }

    async start() {
        const enabled = process.env.FTP_ENABLED !== 'false';
        if (!enabled) {
            console.log('[FTP Server] Disabled via FTP_ENABLED=false');
            return;
        }

        const port = parseInt(process.env.FTP_PORT || '2121', 10);
        let pasvUrl = (process.env.FTP_PASV_URL || '').trim();
        if (!pasvUrl && process.env.APP_URL) {
            pasvUrl = process.env.APP_URL.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
        }
        if (!pasvUrl || pasvUrl === 'localhost') {
            pasvUrl = '127.0.0.1';
        }

        // RFC 959 PASV response requires 4 numeric IPv4 octets. Domain names are invalid in PASV reply!
        if (pasvUrl !== '127.0.0.1' && !net.isIP(pasvUrl)) {
            try {
                const resolved = await dns.lookup(pasvUrl, { family: 4 });
                console.log(`[FTP Server] Resolved PASV hostname '${pasvUrl}' to IPv4: ${resolved.address}`);
                pasvUrl = resolved.address;
            } catch (dnsErr) {
                console.warn(`[FTP Server] Could not resolve PASV hostname '${pasvUrl}':`, dnsErr.message);
                pasvUrl = '187.52.122.246';
            }
        }

        const pasvMin = parseInt(process.env.FTP_PASV_MIN || '10000', 10);
        const pasvMax = parseInt(process.env.FTP_PASV_MAX || '10050', 10);

        console.log(`[FTP Server] Starting on port ${port} (PASV Host: ${pasvUrl}, Ports: ${pasvMin}-${pasvMax})...`);

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        try {
            this.server = new FtpSrv({
                url: `ftp://0.0.0.0:${port}`,
                pasv_url: pasvUrl,
                pasv_min: pasvMin,
                pasv_max: pasvMax,
                anonymous: false
            });

            this.server.on('login', async ({ username, password }, resolve, reject) => {
                try {
                    const token = (username || password || '').trim();
                    if (!token) {
                        return reject(new Error('Authentication token is required'));
                    }

                    // Authenticate router by token in database
                    const router = await db('routers')
                        .where({ api_token: token })
                        .orWhere({ api_token: username })
                        .orWhere({ api_token: password })
                        .first();

                    if (!router) {
                        console.warn(`[FTP Server] Rejected unauthorized login attempt with token: ${token.substring(0, 8)}...`);
                        return reject(new Error('Invalid router token'));
                    }

                    // Dedicated temp dir for this router's session
                    const routerTempDir = path.join(this.tempDir, `router_${router.id}`);
                    if (!fs.existsSync(routerTempDir)) {
                        fs.mkdirSync(routerTempDir, { recursive: true });
                    }

                    const fsInstance = new RouterFtpFileSystem(this, {
                        root: routerTempDir,
                        router
                    });

                    console.log(`[FTP Server] Authenticated router '${router.name}' (ID: ${router.id})`);
                    resolve({ fs: fsInstance });
                } catch (err) {
                    console.error('[FTP Server] Login error:', err.message);
                    reject(err);
                }
            });

            await this.server.listen();
            this.isRunning = true;
            console.log(`[FTP Server] Running on port ${port} (PASV: ${pasvUrl}:${pasvMin}-${pasvMax})`);
        } catch (err) {
            console.error('[FTP Server] Failed to start:', err.message);
        }
    }

    async stop() {
        if (this.server && this.isRunning) {
            await this.server.close();
            this.isRunning = false;
            console.log('[FTP Server] Stopped');
        }
    }
}

module.exports = new FtpBackupService();
