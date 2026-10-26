const db = require('../config/database');

async function migrate() {
    console.log('Creating activity_logs table...');
    const sql = `
    CREATE TABLE IF NOT EXISTS \`activity_logs\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`user_id\` bigint unsigned DEFAULT NULL,
      \`router_id\` bigint unsigned DEFAULT NULL,
      \`type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`action\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`status\` enum('success','info','warning','error') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
      \`metadata\` json DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`activity_logs_user_id_foreign\` (\`user_id\`),
      KEY \`activity_logs_router_id_foreign\` (\`router_id\`),
      KEY \`activity_logs_type_index\` (\`type\`),
      KEY \`activity_logs_status_index\` (\`status\`),
      KEY \`activity_logs_created_at_index\` (\`created_at\`),
      CONSTRAINT \`activity_logs_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`activity_logs_router_id_foreign\` FOREIGN KEY (\`router_id\`) REFERENCES \`routers\` (\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await db.raw(sql);
    console.log('[OK] activity_logs table is ready!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
