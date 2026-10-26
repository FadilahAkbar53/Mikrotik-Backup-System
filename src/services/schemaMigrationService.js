const db = require('../config/database');

class SchemaMigrationService {
    async init() {
        try {
            const hasUsersTable = await db.schema.hasTable('users');
            if (!hasUsersTable) return;

            const hasFailedCount = await db.schema.hasColumn('users', 'failed_login_count');
            if (!hasFailedCount) {
                await db.schema.table('users', (t) => {
                    t.integer('failed_login_count').defaultTo(0);
                });
                console.log('[Schema Migration] Added failed_login_count column to users table.');
            }

            const hasLockoutUntil = await db.schema.hasColumn('users', 'lockout_until');
            if (!hasLockoutUntil) {
                await db.schema.table('users', (t) => {
                    t.timestamp('lockout_until').nullable().defaultTo(null);
                });
                console.log('[Schema Migration] Added lockout_until column to users table.');
            }
        } catch (err) {
            console.warn('[Schema Migration Check]:', err.message);
        }
    }
}

module.exports = new SchemaMigrationService();
