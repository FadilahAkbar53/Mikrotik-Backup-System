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

// Root redirect
router.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    return res.redirect('/login');
});

// Guest Authentication Routes
router.get('/login', isGuest, authController.showLogin);
router.post('/login', isGuest, authController.login);
router.get('/register', isGuest, authController.showRegister);
router.post('/register', isGuest, authController.register);

// Authenticated Routes
router.use(isAuthenticated);

router.post('/logout', authController.logout);
router.get('/dashboard', dashboardController.index);

// Impersonation Exit
router.post('/impersonate/leave', adminUserController.leaveImpersonate);

// Routers Management
router.get('/routers', routerController.index);
router.get('/routers/create', routerController.create);
router.post('/routers', routerController.store);
router.get('/routers/:id', routerController.show);
router.get('/routers/:id/edit', routerController.edit);
router.put('/routers/:id', routerController.update);
router.delete('/routers/:id', routerController.destroy);
router.post('/routers/:id/regenerate-token', routerController.regenerateToken);

// Secure Backup Download, Preview & Management
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

module.exports = router;
