require('dotenv').config();
const db = require('../config/database');
const dayjs = require('dayjs');

async function run() {
    try {
        const hours = parseInt(process.argv[2], 10) || 24;
        const threshold = dayjs().subtract(hours, 'hour').toDate();

        console.log(`Checking routers with no backup in the last ${hours} hours (before ${dayjs(threshold).format('YYYY-MM-DD HH:mm:ss')})...`);

        const overdueRouters = await db('routers')
            .leftJoin('users', 'routers.user_id', 'users.id')
            .where(function() {
                this.whereNull('routers.last_backup_time')
                    .orWhere('routers.last_backup_time', '<', threshold);
            })
            .select(
                'routers.id',
                'routers.name as router_name',
                'routers.last_backup_time',
                'users.name as owner_name',
                'users.email as owner_email'
            );

        if (overdueRouters.length === 0) {
            console.log('✓ All routers are healthy and have backed up within the last 24 hours.');
            process.exit(0);
        }

        console.warn(`Found ${overdueRouters.length} router(s) with overdue/missing backups!\n`);
        console.table(overdueRouters.map(r => ({
            ID: r.id,
            'Router Name': r.router_name,
            Owner: r.owner_name || 'N/A',
            Email: r.owner_email || 'N/A',
            'Last Backup': r.last_backup_time ? dayjs(r.last_backup_time).format('YYYY-MM-DD HH:mm:ss') : 'Never Backed Up'
        })));

        process.exit(0);
    } catch (e) {
        console.error('Error checking backup health:', e);
        process.exit(1);
    }
}

run();
