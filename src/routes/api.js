const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');
const apiBackupController = require('../controllers/apiBackupController');

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// Endpoint upload backup MikroTik
// Supports both POST /api/upload (standard Laravel path) and POST /api/backup/upload
router.post('/upload', upload.single('file'), apiBackupController.upload);
router.post('/backup/upload', upload.single('file'), apiBackupController.upload);

// Endpoint queue status monitoring
router.get('/queue/stats', (req, res) => {
    const backupQueueService = require('../services/backupQueueService');
    res.json(backupQueueService.getStats());
});

module.exports = router;
