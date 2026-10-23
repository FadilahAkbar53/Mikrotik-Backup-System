const knex = require('knex');
require('dotenv').config();

const db = knex({
    client: 'mysql2',
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'mikrotik_backup',
        charset: 'utf8mb4',
        dateStrings: true,
        connectTimeout: 20000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    },
    pool: {
        min: 0,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        validate: (conn) => {
            return !!(
                conn &&
                conn.stream &&
                !conn.stream.destroyed &&
                conn.stream.readable &&
                conn.stream.writable &&
                !conn._fatalError &&
                !conn._closing
            );
        },
        afterCreate: (conn, done) => {
            conn.on('error', (err) => {
                // Squelch connection-level ECONNRESET / EPIPE so it doesn't crash the Node process
                // Tarn pool validate will automatically discard dead sockets and create fresh ones
                if (err.code !== 'ECONNRESET' && err.code !== 'PROTOCOL_CONNECTION_LOST') {
                    console.warn('[DB Pool Connection Error]:', err.code || err.message);
                }
            });
            done(null, conn);
        }
    }
});

module.exports = db;

