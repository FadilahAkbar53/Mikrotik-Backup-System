const db = require('../config/database');

class SettingService {
    constructor() {
        this.cache = new Map();
        this.cacheLoadedAt = 0;
        this.CACHE_TTL = 30000; // 30 seconds
    }

    getDefaults() {
        return {
            app_name: process.env.APP_NAME || 'MikBack',
            app_url: (process.env.APP_URL || 'https://mikback.terrafa.tech').replace(/\/+$/, ''),
            app_timezone: 'Asia/Jakarta',
            ftp_host: process.env.FTP_PASV_URL || 'mikback.terrafa.tech',
            ftp_port: process.env.FTP_PORT || '2121',
            health_threshold_hours: '24',
            backup_recommendation_time: '02:00:00',
            allow_registration: '1',
            default_script_template: 'one_click_setup'
        };
    }

    async loadCache(force = false) {
        const now = Date.now();
        if (!force && this.cache.size > 0 && (now - this.cacheLoadedAt < this.CACHE_TTL)) {
            return;
        }

        try {
            const rows = await db('system_settings').select('key', 'value', 'type', 'description');
            this.cache.clear();
            for (const row of rows) {
                this.cache.set(row.key, row.value);
            }
            this.cacheLoadedAt = now;
        } catch (err) {
            console.error('[SettingService] Error loading system settings from DB:', err.message);
        }
    }

    async get(key, defaultValue = null) {
        await this.loadCache();
        if (this.cache.has(key)) {
            const val = this.cache.get(key);
            if (val !== null && val !== undefined) return val;
        }
        const defaults = this.getDefaults();
        if (key in defaults) return defaults[key];
        return defaultValue;
    }

    async getNumber(key, defaultValue = 0) {
        const val = await this.get(key, defaultValue);
        const parsed = parseFloat(val);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    async getBoolean(key, defaultValue = false) {
        const val = await this.get(key, defaultValue ? '1' : '0');
        return val === '1' || val === 'true' || val === true || val === 1;
    }

    async getAll() {
        await this.loadCache();
        const defaults = this.getDefaults();
        const merged = { ...defaults };

        for (const [k, v] of this.cache.entries()) {
            merged[k] = v;
        }

        return merged;
    }

    async set(key, value, type = 'string', description = '') {
        const stringVal = value !== null && value !== undefined ? String(value).trim() : null;
        const existing = await db('system_settings').where({ key }).first();

        if (existing) {
            await db('system_settings').where({ key }).update({
                value: stringVal,
                updated_at: db.fn.now()
            });
        } else {
            await db('system_settings').insert({
                key,
                value: stringVal,
                type,
                description,
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });
        }

        this.cache.set(key, stringVal);
    }

    async setMany(settingsMap, descriptions = {}) {
        for (const [key, rawValue] of Object.entries(settingsMap)) {
            let type = 'string';
            if (typeof rawValue === 'boolean' || rawValue === '0' || rawValue === '1') {
                type = 'boolean';
            } else if (!isNaN(rawValue) && String(rawValue).trim() !== '') {
                type = 'integer';
            }
            const desc = descriptions[key] || '';
            await this.set(key, rawValue, type, desc);
        }
        await this.loadCache(true);
    }
}

module.exports = new SettingService();
