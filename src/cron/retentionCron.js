const cron = require('node-cron');
const retentionService = require('../services/retentionService');
const activityLogService = require('../services/activityLogService');

function initRetentionCron() {
    // Run daily at 00:05 WIB
    cron.schedule('5 0 * * *', async () => {
        console.log('[CRON] Checking scheduled retention cleanup...');
        try {
            const enabled = await retentionService.getSetting('retention_auto_prune_enabled', true);
            if (!enabled) {
                console.log('[CRON] Auto-prune is disabled in system settings. Skipping.');
                return;
            }

            console.log('[CRON] Executing daily backup retention pruning...');
            const result = await retentionService.pruneAll(false);
            console.log(`[CRON] Prune finished! Files pruned: ${result.total_files_pruned}, Saved: ${result.total_bytes_saved_formatted}`);
            
            activityLogService.log({
                type: 'retention',
                action: 'Pembersihan Retensi Terjadwal',
                description: `Cron retensi harian (00:05) membersihkan ${result.total_files_pruned} berkas lama, menghemat ${result.total_bytes_saved_formatted}`,
                status: 'info',
                metadata: result
            });
        } catch (err) {
            console.error('[CRON] Error during retention pruning:', err.message);
            activityLogService.log({
                type: 'retention',
                action: 'Kegagalan Cron Retensi',
                description: `Kegagalan pada cron pembersihan retensi: ${err.message}`,
                status: 'error'
            });
        }
    });

    console.log('[CRON] Retention scheduler registered for daily execution at 00:05.');
}

module.exports = { initRetentionCron };