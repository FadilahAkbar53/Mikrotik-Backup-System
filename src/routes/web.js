const express = require('express');
const router = express.Router();

const { isAuthenticated, isGuest, isAdmin } = require('../middlewares/auth');

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const routerController = require('../controllers/routerController');
const backupController = require('../controllers/backupController');
const adminUserController = require('../controllers/adminUserController');
const adminScriptTemplateController = require('../controllers/adminScriptTemplateController');
const adminRetentionController = require('../controllers/adminRetentionController');
const adminLogController = require('../controllers/adminLogController');
const adminSettingController = require('../controllers/adminSettingController');
const reportController = require('../controllers/reportController');

// Root redirect (redirects to /dashboard where isAuthenticated validates session lifetime)
router.get('/', (req, res) => {
    return res.redirect('/dashboard');
});

const { authLimiter, passwordLimiter } = require('../middlewares/rateLimiter');

// Guest Authentication Routes
router.get('/login', isGuest, authController.showLogin);
router.post('/login', isGuest, authLimiter, authController.login);
router.get('/register', isGuest, authController.showRegister);
router.post('/register', isGuest, authLimiter, authController.register);

const profileController = require('../controllers/profileController');
const multer = require('multer');
const os = require('os');
const webUpload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max for manual backups
});

// Authenticated Routes
router.use(isAuthenticated);

router.post('/logout', authController.logout);
router.get('/dashboard', dashboardController.index);

// User Profile & Security Management
router.get('/profile', profileController.index);
router.post('/profile', profileController.updateProfile);
router.put('/profile', profileController.updateProfile);
router.post('/profile/password', passwordLimiter, profileController.updatePassword);

// Impersonation Exit
router.post('/impersonate/leave', adminUserController.leaveImpersonate);

// Routers Management
router.get('/routers', routerController.index);
router.get('/routers/export', routerController.exportData);
router.post('/routers/bulk-delete', routerController.bulkDelete);
router.get('/routers/create', routerController.create);
router.post('/routers', routerController.store);
router.get('/routers/:id', routerController.show);
router.get('/routers/:id/edit', routerController.edit);
router.put('/routers/:id', routerController.update);
router.delete('/routers/:id', routerController.destroy);
router.post('/routers/:id/regenerate-token', routerController.regenerateToken);
router.post('/routers/:id/manual-upload', webUpload.single('backup_file'), routerController.manualUpload);

// Hotspot Voucher Reports
router.get('/reports', reportController.index);
router.post('/reports/:routerId/sync', reportController.sync);

// Secure Backup Download, Preview & Management
router.post('/backup/bulk-delete', backupController.bulkDelete);
router.post('/backups/bulk-delete', backupController.bulkDelete);
router.get('/backup/download/:backup_id', backupController.download);
router.get('/backups/:backup_id/download', backupController.download);
router.get('/backup/preview/:backup_id', backupController.preview);
router.get('/backups/:backup_id/preview', backupController.preview);
router.delete('/backup/:backup_id', backupController.destroy);
router.delete('/backups/:backup_id', backupController.destroy);

// Admin Only Routes
router.use('/admin', isAdmin);

// Admin Impersonation Routes (Supports both Laravel /admin/impersonate/:id and /admin/users/:id/impersonate)
router.post('/admin/impersonate/:id', adminUserController.impersonate);
router.post('/admin/users/:id/impersonate', adminUserController.impersonate);

// Admin User Management
router.get('/admin/users', adminUserController.index);
router.get('/admin/users/create', adminUserController.create);
router.post('/admin/users', adminUserController.store);
router.get('/admin/users/:id', adminUserController.show);
router.get('/admin/users/:id/edit', adminUserController.edit);
router.put('/admin/users/:id', adminUserController.update);
router.post('/admin/users/:id/toggle-status', adminUserController.toggleStatus);
router.post('/admin/users/:id/reset-password', adminUserController.resetPassword);
router.post('/admin/users/:id/unlock', adminUserController.unlockAccount);
router.delete('/admin/users/:id', adminUserController.destroy);

// Admin Script Templates (Supports both /admin/templates and /admin/script-templates)
router.get('/admin/templates', adminScriptTemplateController.index);
router.get('/admin/script-templates', adminScriptTemplateController.index);
router.get('/admin/templates/:id/edit', adminScriptTemplateController.edit);
router.get('/admin/script-templates/:id/edit', adminScriptTemplateController.edit);
router.put('/admin/templates/:id', adminScriptTemplateController.update);
router.put('/admin/script-templates/:id', adminScriptTemplateController.update);
router.post('/admin/templates/:id/reset', adminScriptTemplateController.reset);
router.post('/admin/script-templates/:id/reset', adminScriptTemplateController.reset);

// Admin Storage Retention & Policy
router.get('/admin/retention', adminRetentionController.index);
router.put('/admin/retention', adminRetentionController.update);
router.post('/admin/retention/prune', adminRetentionController.prune);
router.post('/admin/retention/dry-run', (req, res, next) => {
    req.query.dry_run = '1';
    return adminRetentionController.prune(req, res, next);
});

// Admin System & Audit Logs
router.get('/admin/logs', adminLogController.index);
router.post('/admin/logs/prune', adminLogController.prune);

// Admin Centralized Application Settings
router.get('/admin/settings', adminSettingController.index);
router.post('/admin/settings', adminSettingController.update);

module.exports = router;
