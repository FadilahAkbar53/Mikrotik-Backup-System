const db = require('../config/database');
const dayjs = require('dayjs');

class ScriptService {
    async getActiveTemplates() {
        return await db('script_templates').where('is_active', 1).orderBy('id', 'asc');
    }

    generateScript(router, templateContent, options = {}) {
        const appUrl = (options.appUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const apiUrl = `${appUrl}/api/upload`;
        const interval = options.interval || '1d';
        const startTime = options.startTime || '02:00:00';
        const routerName = router.name || 'MikroTik';
        const apiToken = router.api_token || '';
        const nowFormatted = dayjs().format('YYYY-MM-DD HH:mm:ss');

        let script = templateContent || '';
        // Exact replacements from Laravel ScriptTemplate
        script = script.replace(/\{\{TOKEN\}\}/g, apiToken);
        script = script.replace(/\{\{API_TOKEN\}\}/g, apiToken);
        script = script.replace(/\{\{URL\}\}/g, apiUrl);
        script = script.replace(/\{\{API_URL\}\}/g, apiUrl);
        script = script.replace(/\{\{ROUTER_NAME\}\}/g, routerName);
        script = script.replace(/\{\{DATE\}\}/g, nowFormatted);
        script = script.replace(/\{\{INTERVAL\}\}/g, interval);
        script = script.replace(/\{\{START_TIME\}\}/g, startTime);

        return script;
    }
}

module.exports = new ScriptService();
