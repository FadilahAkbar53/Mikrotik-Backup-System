-- ====================================================================
-- MikroTik Backup Monitoring System - MySQL Database Schema & Initial Data
-- Domain Target: mikback.terrafa.tech
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Table: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','user') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table: routers
CREATE TABLE IF NOT EXISTS `routers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_backup_time` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `routers_api_token_unique` (`api_token`),
  KEY `routers_user_id_foreign` (`user_id`),
  CONSTRAINT `routers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: backups
CREATE TABLE IF NOT EXISTS `backups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `router_id` bigint unsigned NOT NULL,
  `file_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `backups_router_id_foreign` (`router_id`),
  CONSTRAINT `backups_router_id_foreign` FOREIGN KEY (`router_id`) REFERENCES `routers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table: script_templates
CREATE TABLE IF NOT EXISTS `script_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `default_content` longtext COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `script_templates_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Table: system_settings
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci,
  `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'string',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_settings_key_unique` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Table: voucher_reports
CREATE TABLE IF NOT EXISTS `voucher_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `router_id` bigint unsigned NOT NULL,
  `voucher_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `profile` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `validity` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mac_address` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sale_date` date NOT NULL,
  `sale_time` time NOT NULL,
  `sale_month` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `raw_date_str` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `voucher_unique_key` (`router_id`, `voucher_code`, `sale_date`, `sale_time`),
  KEY `voucher_router_id_idx` (`router_id`),
  KEY `voucher_sale_date_idx` (`sale_date`),
  KEY `voucher_sale_month_idx` (`sale_month`),
  KEY `voucher_profile_idx` (`profile`),
  CONSTRAINT `voucher_reports_router_id_foreign` FOREIGN KEY (`router_id`) REFERENCES `routers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- Initial Default Seed Data
-- ====================================================================

-- Default Accounts (Password: password)
INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`) VALUES
(1, 'Super Administrator', 'admin@mikrotik.test', '$2b$10$0NZUsWeIN9v0WhJKQ5MHBO9Y4nLPDzo56vYTAqb78lRJvIdnrn5wa', 'admin'),
(2, 'Tenant Engineer', 'user@mikrotik.test', '$2b$10$0NZUsWeIN9v0WhJKQ5MHBO9Y4nLPDzo56vYTAqb78lRJvIdnrn5wa', 'user')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- Default Script Templates
INSERT INTO `script_templates` (`id`, `slug`, `name`, `description`, `content`, `default_content`, `is_active`) VALUES
(1, 'full_backup', 'Backup Lengkap (.backup + .rsc)', 'Script lengkap untuk membuat backup biner RouterOS (.backup) dan export script (.rsc) lalu mengunggah keduanya ke server cloud.', 
'{\n    # ====================================================================\n    # MikroTik Automated Cloud Backup Script\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n    :local RscFile ($BackupBase . ".rsc")\n    :local ActualBackup ""\n    :local ActualRsc ""\n\n    # 1. Buat Backup Biner (.backup)\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase dont-encrypt=yes\n\n    # 2. Buat Export Konfigurasi (.rsc)\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact file=$BackupBase\n\n    # Tunggu berkas selesai ditulis ke storage router (maksimal 20 detik)\n    :local waitCount 0\n    :while ((($ActualBackup = "") || ($ActualRsc = "")) && ($waitCount < 20)) do={\n        :delay 1s\n        :set waitCount ($waitCount + 1)\n        :foreach f in=[/file find] do={\n            :local fn [/file get $f name]\n            :if ($fn ~ $BackupFile) do={ :set ActualBackup $fn }\n            :if ($fn ~ $RscFile) do={ :set ActualRsc $fn }\n        }\n    }\n    :if ($ActualBackup = "") do={ :set ActualBackup $BackupFile }\n    :if ($ActualRsc = "") do={ :set ActualRsc $RscFile }\n\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualBackup . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualBackup dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualRsc . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualRsc dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n\n    # 5. Hapus File Sementara dari Disk Router\n    :log info ("MikroTik Backup: Membersihkan file sementara di router...")\n    :if ([:len [/file find where name=$ActualBackup]] > 0) do={ /file remove [find name=$ActualBackup] }\n    :if ([:len [/file find where name=$ActualRsc]] > 0) do={ /file remove [find name=$ActualRsc] }\n\n    :log info ("MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!")\n}',
'{\n    # ====================================================================\n    # MikroTik Automated Cloud Backup Script\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n    :local RscFile ($BackupBase . ".rsc")\n    :local ActualBackup ""\n    :local ActualRsc ""\n\n    # 1. Buat Backup Biner (.backup)\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase dont-encrypt=yes\n\n    # 2. Buat Export Konfigurasi (.rsc)\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact file=$BackupBase\n\n    # Tunggu berkas selesai ditulis ke storage router (maksimal 20 detik)\n    :local waitCount 0\n    :while ((($ActualBackup = "") || ($ActualRsc = "")) && ($waitCount < 20)) do={\n        :delay 1s\n        :set waitCount ($waitCount + 1)\n        :foreach f in=[/file find] do={\n            :local fn [/file get $f name]\n            :if ($fn ~ $BackupFile) do={ :set ActualBackup $fn }\n            :if ($fn ~ $RscFile) do={ :set ActualRsc $fn }\n        }\n    }\n    :if ($ActualBackup = "") do={ :set ActualBackup $BackupFile }\n    :if ($ActualRsc = "") do={ :set ActualRsc $RscFile }\n\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualBackup . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualBackup dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualRsc . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualRsc dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n\n    # 5. Hapus File Sementara dari Disk Router\n    :log info ("MikroTik Backup: Membersihkan file sementara di router...")\n    :if ([:len [/file find where name=$ActualBackup]] > 0) do={ /file remove [find name=$ActualBackup] }\n    :if ([:len [/file find where name=$ActualRsc]] > 0) do={ /file remove [find name=$ActualRsc] }\n\n    :log info ("MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!")\n}',
1),
(2, 'binary_only', 'Hanya Binary (.backup)', 'Script untuk membuat berkas backup binary RouterOS dan mengunggahnya ke server.', 
'{\n    # ====================================================================\n    # MikroTik Binary Backup Only (.backup)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n    :local ActualBackup ""\n\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase dont-encrypt=yes\n\n    :local waitCount 0\n    :while (($ActualBackup = "") && ($waitCount < 20)) do={\n        :delay 1s\n        :set waitCount ($waitCount + 1)\n        :foreach f in=[/file find] do={\n            :local fn [/file get $f name]\n            :if ($fn ~ $BackupFile) do={ :set ActualBackup $fn }\n        }\n    }\n    :if ($ActualBackup = "") do={ :set ActualBackup $BackupFile }\n\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualBackup . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualBackup dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$ActualBackup]] > 0) do={ /file remove [find name=$ActualBackup] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
'{\n    # ====================================================================\n    # MikroTik Binary Backup Only (.backup)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n    :local ActualBackup ""\n\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase dont-encrypt=yes\n\n    :local waitCount 0\n    :while (($ActualBackup = "") && ($waitCount < 20)) do={\n        :delay 1s\n        :set waitCount ($waitCount + 1)\n        :foreach f in=[/file find] do={\n            :local fn [/file get $f name]\n            :if ($fn ~ $BackupFile) do={ :set ActualBackup $fn }\n        }\n    }\n    :if ($ActualBackup = "") do={ :set ActualBackup $BackupFile }\n\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualBackup . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualBackup dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$ActualBackup]] > 0) do={ /file remove [find name=$ActualBackup] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
1),
(3, 'script_only', 'Hanya Script (.rsc)', 'Script untuk membuat export konfigurasi RouterOS (.rsc) teks terbaca dan mengunggahnya ke server.', 
'{\n    # ====================================================================\n    # MikroTik Export Configuration Only (.rsc)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local RscFile ($BackupBase . ".rsc")\n    :local ActualRsc ""\n\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact file=$BackupBase\n\n    :local waitCount 0\n    :while (($ActualRsc = "") && ($waitCount < 20)) do={\n        :delay 1s\n        :set waitCount ($waitCount + 1)\n        :foreach f in=[/file find] do={\n            :local fn [/file get $f name]\n            :if ($fn ~ $RscFile) do={ :set ActualRsc $fn }\n        }\n    }\n    :if ($ActualRsc = "") do={ :set ActualRsc $RscFile }\n\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualRsc . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualRsc dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$ActualRsc]] > 0) do={ /file remove [find name=$ActualRsc] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
'{\n    # ====================================================================\n    # MikroTik Export Configuration Only (.rsc)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local RscFile ($BackupBase . ".rsc")\n    :local ActualRsc ""\n\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact file=$BackupBase\n\n    :local waitCount 0\n    :while (($ActualRsc = "") && ($waitCount < 20)) do={\n        :delay 1s\n        :set waitCount ($waitCount + 1)\n        :foreach f in=[/file find] do={\n            :local fn [/file get $f name]\n            :if ($fn ~ $RscFile) do={ :set ActualRsc $fn }\n        }\n    }\n    :if ($ActualRsc = "") do={ :set ActualRsc $RscFile }\n\n    :log info ("MikroTik Backup: Mengunggah file " . $ActualRsc . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$ActualRsc dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$ActualRsc]] > 0) do={ /file remove [find name=$ActualRsc] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
1),
(4, 'scheduler_cmd', 'Perintah RouterOS Scheduler', 'Perintah terminal MikroTik untuk menjadwalkan otomatis eksekusi script backup setiap hari.', 
'/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test,password,sensitive on-event="cloud-backup"',
'/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test,password,sensitive on-event="cloud-backup"',
0),
(5, 'one_click_setup', 'Scheduler All-in-One (Script Langsung di Scheduler)', 'Perintah otomatis komplit untuk New Terminal Winbox. Menambahkan Scheduler di System > Scheduler lengkap dengan script backup di dalam kolom on-event (tidak terpisah di System > Script).', 
'# ====================================================================\n# MikroTik Automated Backup (Scheduler All-in-One)\n# Router: {{ROUTER_NAME}}\n# Dibuat: {{DATE}}\n# ====================================================================\n\n# 1. Bersihkan scheduler lama & bersihkan script terpisah (jika ada)\n:if ([:len [/system scheduler find name="daily-cloud-backup"]] > 0) do={ /system scheduler remove [find name="daily-cloud-backup"] }\n:if ([:len [/system script find name="cloud-backup"]] > 0) do={ /system script remove [find name="cloud-backup"] }\n\n# 2. Pasang Scheduler dengan Script Backup Lengkap didalamnya (All-in-One)\n/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test,password,sensitive on-event="{\\\n\\n    :local TokenRouter \\"{{TOKEN}}\\"\\\n\\n    :local FtpHost \\"{{FTP_HOST}}\\"\\\n\\n    :local Identity [/system identity get name]\\\n\\n    :local BackupBase (\\$Identity . \\"-backup\\")\\\n\\n    :local BackupFile (\\$BackupBase . \\".backup\\")\\\n\\n    :local RscFile (\\$BackupBase . \\".rsc\\")\\\n\\n    :local ActualBackup \\"\\"\\\n\\n    :local ActualRsc \\"\\"\\\n\\n\\\n\\n    # 1. Buat Backup Biner (.backup)\\\n\\n    :log info (\\"MikroTik Backup: Membuat backup sistem \\" . \\$BackupFile)\\\n\\n    /system backup save name=\\$BackupBase dont-encrypt=yes\\\n\\n\\\n\\n    # 2. Buat Export Konfigurasi (.rsc)\\\n\\n    :log info (\\"MikroTik Backup: Membuat export konfigurasi \\" . \\$RscFile)\\\n\\n    /export compact file=\\$BackupBase\\\n\\n\\\n\\n    # Tunggu berkas selesai ditulis ke storage router (maksimal 20 detik)\\\n\\n    :local waitCount 0\\\n\\n    :while (((\\$ActualBackup = \\"\\") || (\\$ActualRsc = \\"\\")) && (\\$waitCount < 20)) do={\\\n\\n        :delay 1s\\\n\\n        :set waitCount (\\$waitCount + 1)\\\n\\n        :foreach f in=[/file find] do={\\\n\\n            :local fn [/file get \\$f name]\\\n\\n            :if (\\$fn ~ \\$BackupFile) do={ :set ActualBackup \\$fn }\\\n\\n            :if (\\$fn ~ \\$RscFile) do={ :set ActualRsc \\$fn }\\\n\\n        }\\\n\\n    }\\\n\\n    :if (\\$ActualBackup = \\"\\") do={ :set ActualBackup \\$BackupFile }\\\n\\n    :if (\\$ActualRsc = \\"\\") do={ :set ActualRsc \\$RscFile }\\\n\\n\\\n\\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$ActualBackup . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$ActualBackup dst-path=\\$BackupFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$BackupFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$BackupFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$ActualRsc . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$ActualRsc dst-path=\\$RscFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$RscFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$RscFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 5. Hapus File Sementara dari Disk Router\\\n\\n    :log info (\\"MikroTik Backup: Membersihkan file sementara di router...\\")\\\n\\n    :if ([:len [/file find where name=\\$ActualBackup]] > 0) do={ /file remove [find name=\\$ActualBackup] }\\\n\\n    :if ([:len [/file find where name=\\$ActualRsc]] > 0) do={ /file remove [find name=\\$ActualRsc] }\\\n\\n\\\n\\n    :log info (\\"MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!\\")\\\n\\n}"\n\n# 3. Status Notifikasi\n:log info "MikroTik Backup: Scheduler All-in-One berhasil dipasang di System > Scheduler!"\n:put "[OK] BERHASIL! Scheduler \'\'daily-cloud-backup\'\' aktif di System > Scheduler (tanpa System > Script)."\n:put "[INFO] Anda dapat menguji langsung di Winbox: System -> Scheduler -> double click \'\'daily-cloud-backup\'\' -> klik \'\'Run Script\'\'."',
'# ====================================================================\n# MikroTik Automated Backup (Scheduler All-in-One)\n# Router: {{ROUTER_NAME}}\n# Dibuat: {{DATE}}\n# ====================================================================\n\n# 1. Bersihkan scheduler lama & bersihkan script terpisah (jika ada)\n:if ([:len [/system scheduler find name="daily-cloud-backup"]] > 0) do={ /system scheduler remove [find name="daily-cloud-backup"] }\n:if ([:len [/system script find name="cloud-backup"]] > 0) do={ /system script remove [find name="cloud-backup"] }\n\n# 2. Pasang Scheduler dengan Script Backup Lengkap didalamnya (All-in-One)\n/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test,password,sensitive on-event="{\\\n\\n    :local TokenRouter \\"{{TOKEN}}\\"\\\n\\n    :local FtpHost \\"{{FTP_HOST}}\\"\\\n\\n    :local Identity [/system identity get name]\\\n\\n    :local BackupBase (\\$Identity . \\"-backup\\")\\\n\\n    :local BackupFile (\\$BackupBase . \\".backup\\")\\\n\\n    :local RscFile (\\$BackupBase . \\".rsc\\")\\\n\\n    :local ActualBackup \\"\\"\\\n\\n    :local ActualRsc \\"\\"\\\n\\n\\\n\\n    # 1. Buat Backup Biner (.backup)\\\n\\n    :log info (\\"MikroTik Backup: Membuat backup sistem \\" . \\$BackupFile)\\\n\\n    /system backup save name=\\$BackupBase dont-encrypt=yes\\\n\\n\\\n\\n    # 2. Buat Export Konfigurasi (.rsc)\\\n\\n    :log info (\\"MikroTik Backup: Membuat export konfigurasi \\" . \\$RscFile)\\\n\\n    /export compact file=\\$BackupBase\\\n\\n\\\n\\n    # Tunggu berkas selesai ditulis ke storage router (maksimal 20 detik)\\\n\\n    :local waitCount 0\\\n\\n    :while (((\\$ActualBackup = \\"\\") || (\\$ActualRsc = \\"\\")) && (\\$waitCount < 20)) do={\\\n\\n        :delay 1s\\\n\\n        :set waitCount (\\$waitCount + 1)\\\n\\n        :foreach f in=[/file find] do={\\\n\\n            :local fn [/file get \\$f name]\\\n\\n            :if (\\$fn ~ \\$BackupFile) do={ :set ActualBackup \\$fn }\\\n\\n            :if (\\$fn ~ \\$RscFile) do={ :set ActualRsc \\$fn }\\\n\\n        }\\\n\\n    }\\\n\\n    :if (\\$ActualBackup = \\"\\") do={ :set ActualBackup \\$BackupFile }\\\n\\n    :if (\\$ActualRsc = \\"\\") do={ :set ActualRsc \\$RscFile }\\\n\\n\\\n\\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$ActualBackup . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$ActualBackup dst-path=\\$BackupFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$BackupFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$BackupFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$ActualRsc . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$ActualRsc dst-path=\\$RscFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$RscFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$RscFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 5. Hapus File Sementara dari Disk Router\\\n\\n    :log info (\\"MikroTik Backup: Membersihkan file sementara di router...\\")\\\n\\n    :if ([:len [/file find where name=\\$ActualBackup]] > 0) do={ /file remove [find name=\\$ActualBackup] }\\\n\\n    :if ([:len [/file find where name=\\$ActualRsc]] > 0) do={ /file remove [find name=\\$ActualRsc] }\\\n\\n\\\n\\n    :log info (\\"MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!\\")\\\n\\n}"\n\n# 3. Status Notifikasi\n:log info "MikroTik Backup: Scheduler All-in-One berhasil dipasang di System > Scheduler!"\n:put "[OK] BERHASIL! Scheduler \'\'daily-cloud-backup\'\' aktif di System > Scheduler (tanpa System > Script)."\n:put "[INFO] Anda dapat menguji langsung di Winbox: System -> Scheduler -> double click \'\'daily-cloud-backup\'\' -> klik \'\'Run Script\'\'."',
1)
ON DUPLICATE KEY UPDATE `content`=VALUES(`content`), `default_content`=VALUES(`default_content`);

-- Default System Settings (Retention Policies)
INSERT INTO `system_settings` (`key`, `value`, `type`, `description`) VALUES
('retention_max_months', '4', 'integer', 'Masa simpan maksimal data backup dalam hitungan bulan (Default: 4 bulan).'),
('retention_max_days_per_month', '7', 'integer', 'Maksimal jumlah tanggal/hari backup unik yang disimpan per bulan (Default: 7 hari terbaru).'),
('retention_auto_prune_enabled', '1', 'boolean', 'Sakelar utama kebijakan rotasi retensi penyimpanan otomatis.'),
('retention_prune_on_upload', '1', 'boolean', 'Pangkas backup terlama di bulan berjalan secara realtime setiap ada backup baru masuk.'),
('retention_replace_same_day', '1', 'boolean', 'Gantikan backup lama pada hari yang sama jika ada upload baru (Maksimal 1 berkas per tipe/hari).'),
('retention_last_pruned_at', NULL, 'string', 'Waktu terakhir pembersihan backup dieksekusi.'),
('retention_last_pruned_count', '0', 'integer', 'Jumlah berkas yang dibersihkan pada eksekusi terakhir.'),
('retention_last_pruned_bytes', '0', 'integer', 'Ukuran ruang disk (byte) yang dihemat pada eksekusi terakhir.')
ON DUPLICATE KEY UPDATE `type`=VALUES(`type`);
