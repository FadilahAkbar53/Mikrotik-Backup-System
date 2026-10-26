const db = require('../config/database');
const dayjs = require('dayjs');
const settingService = require('./settingService');

class ScriptService {
    async getActiveTemplates() {
        return await db('script_templates').where('is_active', 1).orderBy('id', 'asc');
    }

    generateScript(router, templateContent, options = {}) {
        const cachedAppUrl = settingService.cache.get('app_url');
        const cachedFtpHost = settingService.cache.get('ftp_host');
        const cachedFtpPort = settingService.cache.get('ftp_port');
        const cachedStartTime = settingService.cache.get('backup_recommendation_time');

        const appUrl = (options.appUrl || cachedAppUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const apiUrl = `${appUrl}/api/upload`;
        const interval = options.interval || '1d';
        const startTime = options.startTime || cachedStartTime || '02:00:00';
        const routerName = router.name || 'MikroTik';
        const apiToken = router.api_token || '';
        const nowFormatted = dayjs().format('YYYY-MM-DD HH:mm:ss');

        let ftpHost = options.ftpHost || cachedFtpHost || process.env.FTP_PASV_URL || appUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
        if (!ftpHost || ftpHost === 'localhost' || ftpHost === '127.0.0.1') {
            ftpHost = '187.52.122.246';
        }
        const ftpPort = options.ftpPort || cachedFtpPort || process.env.FTP_PORT || '2121';

        let script = templateContent || '';
        // Exact replacements for router scripts
        script = script.replace(/\{\{TOKEN\}\}/g, apiToken);
        script = script.replace(/\{\{API_TOKEN\}\}/g, apiToken);
        script = script.replace(/\{\{URL\}\}/g, apiUrl);
        script = script.replace(/\{\{API_URL\}\}/g, apiUrl);
        script = script.replace(/\{\{FTP_HOST\}\}/g, ftpHost);
        script = script.replace(/\{\{FTP_PORT\}\}/g, ftpPort);
        script = script.replace(/\{\{ROUTER_NAME\}\}/g, routerName);
        script = script.replace(/\{\{DATE\}\}/g, nowFormatted);
        script = script.replace(/\{\{INTERVAL\}\}/g, interval);
        script = script.replace(/\{\{START_TIME\}\}/g, startTime);

        return script;
    }
}

module.exports = new ScriptService();
