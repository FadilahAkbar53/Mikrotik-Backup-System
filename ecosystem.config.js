module.exports = {
  apps: [
    {
      name: 'mikrotik-backup-app',
      script: 'src/server.js',
      instances: 1, // Fork mode (1 instance) wajib digunakan agar Cron dan Queue berjalan konsisten tanpa duplikasi
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
