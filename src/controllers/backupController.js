const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);
const retentionService = require('../services/retentionService');

function resolvePhysicalPath(filePath) {
    if (!filePath) return null;
    if (path.isAbsolute(filePath)) return filePath;

    const cwd = process.cwd();
    // 1. cwd/filePath
    let candidate = path.join(cwd, filePath);
    if (fs.existsSync(candidate)) return candidate;

    // 2. cwd/storage/filePath
    candidate = path.join(cwd, 'storage', filePath);
    if (fs.existsSync(candidate)) return candidate;

    // 3. cwd/storage/app/filePath (Laravel disk standard)
    candidate = path.join(cwd, 'storage', 'app', filePath);
    if (fs.existsSync(candidate)) return candidate;

    // 4. If filePath starts with 'storage/'
    if (filePath.startsWith('storage/') || filePath.startsWith('storage\\')) {
        candidate = path.join(cwd, filePath.replace(/^storage[\/\\]/, ''));
        if (fs.existsSync(candidate)) return candidate;
        candidate = path.join(cwd, 'storage', filePath.replace(/^storage[\/\\]/, ''));
        if (fs.existsSync(candidate)) return candidate;
    }

    // Default fallback
    return path.join(cwd, 'storage', filePath);
}

module.exports = {
    async download(req, res) {
        try {
            const { backup_id } = req.params;
            const user = req.session.user;

            const backup = await db('backups')
                .join('routers', 'backups.router_id', 'routers.id')
                .where('backups.id', backup_id)
                .select('backups.*', 'routers.user_id as router_owner_id', 'routers.name as router_name')
                .first();

            if (!backup) {
                req.flash('error', 'Berkas backup tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && backup.router_owner_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            const fullPath = resolvePhysicalPath(backup.file_path);

            if (!fs.existsSync(fullPath)) {
                req.flash('error', 'Berkas fisik backup tidak ditemukan pada storage server.');
                return res.redirect(`/routers/${backup.router_id}?tab=backups`);
            }

            const filename = path.basename(backup.file_path);
            return res.download(fullPath, filename);
        } catch (err) {
            console.error('Download error:', err);
            req.flash('error', 'Gagal mengunduh berkas: ' + err.message);
            return res.redirect('/routers');
        }
    },

    async preview(req, res) {
        try {
            const { backup_id } = req.params;
            const user = req.session.user;
            const isJsonRequest = req.xhr || req.headers.accept?.includes('application/json') || req.query.format === 'json';

            const backup = await db('backups')
                .join('routers', 'backups.router_id', 'routers.id')
                .leftJoin('users', 'routers.user_id', 'users.id')
                .where('backups.id', backup_id)
                .select(
                    'backups.*',
                    'routers.user_id as router_owner_id',
                    'routers.name as router_name',
                    'users.name as owner_name'
                )
                .first();

            if (!backup) {
                if (isJsonRequest) {
                    return res.status(404).json({ success: false, message: 'Berkas backup tidak ditemukan di database.' });
                }
                req.flash('error', 'Berkas backup tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && backup.router_owner_id !== user.id) {
                if (isJsonRequest) {
                    return res.status(403).json({ success: false, message: 'Akses ditolak.' });
                }
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            const filename = path.basename(backup.file_path);
            const ext = path.extname(filename).toLowerCase();

            if (ext !== '.rsc' && backup.file_type !== 'rsc') {
                if (isJsonRequest) {
                    return res.status(400).json({ success: false, message: 'Hanya berkas script (.rsc) yang dapat dilihat isinya.' });
                }
                req.flash('error', 'Pratinjau teks hanya didukung untuk berkas script export (.rsc).');
                return res.redirect(`/routers/${backup.router_id}?tab=backups`);
            }

            const fullPath = resolvePhysicalPath(backup.file_path);

            if (!fs.existsSync(fullPath)) {
                if (isJsonRequest) {
                    return res.status(404).json({ success: false, message: `Berkas fisik '${filename}' tidak ditemukan di disk server.` });
                }
                req.flash('error', `Berkas fisik '${filename}' tidak ditemukan di disk server.`);
                return res.redirect(`/routers/${backup.router_id}?tab=backups`);
            }

            const content = fs.readFileSync(fullPath, 'utf8');

            if (isJsonRequest) {
                return res.json({
                    success: true,
                    id: backup.id,
                    filename: filename,
                    router_name: backup.router_name || 'Router',
                    owner_name: backup.owner_name || 'N/A',
                    size: retentionService.formatBytes(backup.file_size || fs.statSync(fullPath).size),
                    created_at: dayjs(backup.created_at).format('DD MMM YYYY, HH:mm') + ' WIB',
                    created_at_relative: dayjs(backup.created_at).fromNow(),
                    lines_count: content.split('\n').length,
                    characters_count: content.length,
                    download_url: `/backup/download/${backup.id}`,
                    content: content
                });
            }

            return res.render('backup/preview', {
                title: `Lihat Isi Script: ${filename}`,
                backup,
                filename,
                content,
                fileSizeFormatted: retentionService.formatBytes(backup.file_size || fs.statSync(fullPath).size)
            });
        } catch (err) {
            console.error('Preview error:', err);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({ success: false, message: 'Gagal memuat pratinjau script: ' + err.message });
            }
            req.flash('error', 'Gagal memuat pratinjau script: ' + err.message);
            return res.redirect('/routers');
        }
    },

    async destroy(req, res) {
        try {
            const { backup_id } = req.params;
            const user = req.session.user;

            const backup = await db('backups')
                .join('routers', 'backups.router_id', 'routers.id')
                .where('backups.id', backup_id)
                .select('backups.*', 'routers.user_id as router_owner_id')
                .first();

            if (!backup) {
                req.flash('error', 'Berkas backup tidak ditemukan.');
                return res.redirect('/routers');
            }

            if (user.role !== 'admin' && backup.router_owner_id !== user.id) {
                req.flash('error', 'Akses ditolak.');
                return res.redirect('/routers');
            }

            const fullPath = resolvePhysicalPath(backup.file_path);
            if (fs.existsSync(fullPath)) {
                try { fs.unlinkSync(fullPath); } catch (e) {}
            }

            await db('backups').where('id', backup_id).delete();

            req.flash('success', 'Berkas backup berhasil dihapus dari sistem.');
            return res.redirect(`/routers/${backup.router_id}?tab=backups`);
        } catch (err) {
            console.error('Destroy backup error:', err);
            req.flash('error', 'Gagal menghapus berkas: ' + err.message);
            return res.redirect('/routers');
        }
    }
};
