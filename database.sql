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
(1, 'full_backup', 'Backup Lengkap (.backup + .rsc)', 'Script lengkap untuk membuat backup biner RouterOS (.backup) dan export script (.rsc) lalu mengunggah keduanya ke server cloud via FTP.', 
'{\n    # ====================================================================\n    # MikroTik Automated Cloud Backup Script\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n    :local RscFile ($BackupBase . ".rsc")\n\n    # 1. Buat Backup Biner (.backup)\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase\n\n    # 2. Buat Export Konfigurasi (.rsc)\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact show-sensitive file=$BackupBase\n\n    # Beri jeda 5 detik agar file selesai ditulis ke disk router\n    :delay 5s\n\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $BackupFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$BackupFile dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $RscFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$RscFile dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n\n    # 5. Hapus File Sementara dari Disk Router\n    :log info ("MikroTik Backup: Membersihkan file sementara di router...")\n    :if ([:len [/file find where name=$BackupFile]] > 0) do={ /file remove [find name=$BackupFile] }\n    :if ([:len [/file find where name=$RscFile]] > 0) do={ /file remove [find name=$RscFile] }\n\n    :log info ("MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!")\n}',
'{\n    # ====================================================================\n    # MikroTik Automated Cloud Backup Script\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n    :local RscFile ($BackupBase . ".rsc")\n\n    # 1. Buat Backup Biner (.backup)\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase\n\n    # 2. Buat Export Konfigurasi (.rsc)\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact show-sensitive file=$BackupBase\n\n    # Beri jeda 5 detik agar file selesai ditulis ke disk router\n    :delay 5s\n\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $BackupFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$BackupFile dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\n    :log info ("MikroTik Backup: Mengunggah file " . $RscFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$RscFile dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n\n    # 5. Hapus File Sementara dari Disk Router\n    :log info ("MikroTik Backup: Membersihkan file sementara di router...")\n    :if ([:len [/file find where name=$BackupFile]] > 0) do={ /file remove [find name=$BackupFile] }\n    :if ([:len [/file find where name=$RscFile]] > 0) do={ /file remove [find name=$RscFile] }\n\n    :log info ("MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!")\n}',
1),
(2, 'binary_only', 'Hanya Binary (.backup)', 'Script untuk membuat berkas backup binary RouterOS dan mengunggahnya ke server via FTP.',
'{\n    # ====================================================================\n    # MikroTik Binary Backup Only (.backup)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase\n    :delay 5s\n\n    :log info ("MikroTik Backup: Mengunggah file " . $BackupFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$BackupFile dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$BackupFile]] > 0) do={ /file remove [find name=$BackupFile] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
'{\n    # ====================================================================\n    # MikroTik Binary Backup Only (.backup)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local BackupFile ($BackupBase . ".backup")\n\n    :log info ("MikroTik Backup: Membuat backup sistem " . $BackupFile)\n    /system backup save name=$BackupBase\n    :delay 5s\n\n    :log info ("MikroTik Backup: Mengunggah file " . $BackupFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$BackupFile dst-path=$BackupFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $BackupFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $BackupFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$BackupFile]] > 0) do={ /file remove [find name=$BackupFile] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
1),
(3, 'script_only', 'Hanya Script (.rsc)', 'Script untuk membuat export konfigurasi RouterOS (.rsc) teks terbaca dan mengunggahnya ke server via FTP.',
'{\n    # ====================================================================\n    # MikroTik Export Configuration Only (.rsc)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local RscFile ($BackupBase . ".rsc")\n\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact show-sensitive file=$BackupBase\n    :delay 5s\n\n    :log info ("MikroTik Backup: Mengunggah file " . $RscFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$RscFile dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$RscFile]] > 0) do={ /file remove [find name=$RscFile] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
'{\n    # ====================================================================\n    # MikroTik Export Configuration Only (.rsc)\n    # Router: {{ROUTER_NAME}}\n    # Generated: {{DATE}}\n    # ====================================================================\n    :local TokenRouter "{{TOKEN}}"\n    :local FtpHost "{{FTP_HOST}}"\n    :local Identity [/system identity get name]\n    :local BackupBase ($Identity . "-backup")\n    :local RscFile ($BackupBase . ".rsc")\n\n    :log info ("MikroTik Backup: Membuat export konfigurasi " . $RscFile)\n    /export compact show-sensitive file=$BackupBase\n    :delay 5s\n\n    :log info ("MikroTik Backup: Mengunggah file " . $RscFile . " ke server...")\n    :do {\n        /tool fetch mode=ftp address=$FtpHost port={{FTP_PORT}} user=$TokenRouter password=$TokenRouter src-path=$RscFile dst-path=$RscFile upload=yes\n        :log info ("MikroTik Backup: Berhasil mengunggah " . $RscFile)\n    } on-error={\n        :log error ("MikroTik Backup: Gagal mengunggah " . $RscFile)\n    }\n\n    :delay 3s\n    :if ([:len [/file find where name=$RscFile]] > 0) do={ /file remove [find name=$RscFile] }\n    :log info ("MikroTik Backup: Selesai!")\n}',
1),
(4, 'scheduler_cmd', 'Perintah RouterOS Scheduler', 'Perintah terminal MikroTik untuk menjadwalkan otomatis eksekusi script backup setiap hari.',
'/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test on-event="cloud-backup"',
'/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test on-event="cloud-backup"',
1),
(5, 'one_click_setup', '1-Click Terminal Setup (Script + Scheduler)', 'Perintah otomatis komplit untuk New Terminal Winbox. Sekali enter langsung membuat script backup lengkap di /system script DAN mengaktifkan Scheduler otomatis di /system scheduler.',
'# ====================================================================\n# MikroTik 1-Click Automated Setup (Script + Scheduler)\n# Router: {{ROUTER_NAME}}\n# Dibuat: {{DATE}}\n# ====================================================================\n\n# 1. Bersihkan script & scheduler lama jika sudah ada (mencegah duplikasi)\n:if ([:len [/system script find name="cloud-backup"]] > 0) do={ /system script remove [find name="cloud-backup"] }\n:if ([:len [/system scheduler find name="daily-cloud-backup"]] > 0) do={ /system scheduler remove [find name="daily-cloud-backup"] }\n\n# 2. Buat Script Backup Lengkap di /system script\n/system script add dont-req-permissions=no name="cloud-backup" policy=ftp,read,write,policy,test source="{\\\n\\n    :local TokenRouter \\"{{TOKEN}}\\"\\\n\\n    :local FtpHost \\"{{FTP_HOST}}\\"\\\n\\n    :local Identity [/system identity get name]\\\n\\n    :local BackupBase (\\$Identity . \\"-backup\\")\\\n\\n    :local BackupFile (\\$BackupBase . \\".backup\\")\\\n\\n    :local RscFile (\\$BackupBase . \\".rsc\\")\\\n\\n\\\n\\n    # 1. Buat Backup Biner (.backup)\\\n\\n    :log info (\\"MikroTik Backup: Membuat backup sistem \\" . \\$BackupFile)\\\n\\n    /system backup save name=\\$BackupBase\\\n\\n\\\n\\n    # 2. Buat Export Konfigurasi (.rsc)\\\n\\n    :log info (\\"MikroTik Backup: Membuat export konfigurasi \\" . \\$RscFile)\\\n\\n    /export compact show-sensitive file=\\$BackupBase\\\n\\n\\\n\\n    # Beri jeda 5 detik agar file selesai ditulis ke disk router\\\n\\n    :delay 5s\\\n\\n\\\n\\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$BackupFile . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$BackupFile dst-path=\\$BackupFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$BackupFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$BackupFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$RscFile . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$RscFile dst-path=\\$RscFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$RscFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$RscFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 5. Hapus File Sementara dari Disk Router\\\n\\n    :log info (\\"MikroTik Backup: Membersihkan file sementara di router...\\")\\\n\\n    :if ([:len [/file find where name=\\$BackupFile]] > 0) do={ /file remove [find name=\\$BackupFile] }\\\n\\n    :if ([:len [/file find where name=\\$RscFile]] > 0) do={ /file remove [find name=\\$RscFile] }\\\n\\n\\\n\\n    :log info (\\"MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!\\")\\\n\\n}\"\n\n# 3. Buat Scheduler Otomatis di /system scheduler\n/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test on-event="cloud-backup"\n\n# 4. Status Notifikasi\n:log info "MikroTik Backup: 1-Click Setup Berhasil! Script & Scheduler telah aktif."\n:put "[OK] 1-Click Setup BERHASIL! Script ''cloud-backup'' & Scheduler ''daily-cloud-backup'' aktif."\n:put "[INFO] Anda dapat menguji backup sekarang dengan: /system script run cloud-backup"',
'# ====================================================================\n# MikroTik 1-Click Automated Setup (Script + Scheduler)\n# Router: {{ROUTER_NAME}}\n# Dibuat: {{DATE}}\n# ====================================================================\n\n# 1. Bersihkan script & scheduler lama jika sudah ada (mencegah duplikasi)\n:if ([:len [/system script find name="cloud-backup"]] > 0) do={ /system script remove [find name="cloud-backup"] }\n:if ([:len [/system scheduler find name="daily-cloud-backup"]] > 0) do={ /system scheduler remove [find name="daily-cloud-backup"] }\n\n# 2. Buat Script Backup Lengkap di /system script\n/system script add dont-req-permissions=no name="cloud-backup" policy=ftp,read,write,policy,test source="{\\\n\\n    :local TokenRouter \\"{{TOKEN}}\\"\\\n\\n    :local FtpHost \\"{{FTP_HOST}}\\"\\\n\\n    :local Identity [/system identity get name]\\\n\\n    :local BackupBase (\\$Identity . \\"-backup\\")\\\n\\n    :local BackupFile (\\$BackupBase . \\".backup\\")\\\n\\n    :local RscFile (\\$BackupBase . \\".rsc\\")\\\n\\n\\\n\\n    # 1. Buat Backup Biner (.backup)\\\n\\n    :log info (\\"MikroTik Backup: Membuat backup sistem \\" . \\$BackupFile)\\\n\\n    /system backup save name=\\$BackupBase\\\n\\n\\\n\\n    # 2. Buat Export Konfigurasi (.rsc)\\\n\\n    :log info (\\"MikroTik Backup: Membuat export konfigurasi \\" . \\$RscFile)\\\n\\n    /export compact show-sensitive file=\\$BackupBase\\\n\\n\\\n\\n    # Beri jeda 5 detik agar file selesai ditulis ke disk router\\\n\\n    :delay 5s\\\n\\n\\\n\\n    # 3. Upload File .backup via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$BackupFile . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$BackupFile dst-path=\\$BackupFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$BackupFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$BackupFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 4. Upload File .rsc via FTP Port {{FTP_PORT}}\\\n\\n    :log info (\\"MikroTik Backup: Mengunggah file \\" . \\$RscFile . \\" ke server...\\")\\\n\\n    :do {\\\n\\n        /tool fetch mode=ftp address=\\$FtpHost port={{FTP_PORT}} user=\\$TokenRouter password=\\$TokenRouter src-path=\\$RscFile dst-path=\\$RscFile upload=yes\\\n\\n        :log info (\\"MikroTik Backup: Berhasil mengunggah \\" . \\$RscFile)\\\n\\n    } on-error={\\\n\\n        :log error (\\"MikroTik Backup: Gagal mengunggah \\" . \\$RscFile)\\\n\\n    }\\\n\\n\\\n\\n    :delay 3s\\\n\\n\\\n\\n    # 5. Hapus File Sementara dari Disk Router\\\n\\n    :log info (\\"MikroTik Backup: Membersihkan file sementara di router...\\")\\\n\\n    :if ([:len [/file find where name=\\$BackupFile]] > 0) do={ /file remove [find name=\\$BackupFile] }\\\n\\n    :if ([:len [/file find where name=\\$RscFile]] > 0) do={ /file remove [find name=\\$RscFile] }\\\n\\n\\\n\\n    :log info (\\"MikroTik Backup: Seluruh proses backup (.backup & .rsc) selesai dengan sukses!\\")\\\n\\n}\"\n\n# 3. Buat Scheduler Otomatis di /system scheduler\n/system scheduler add name="daily-cloud-backup" start-time={{START_TIME}} interval={{INTERVAL}} policy=ftp,read,write,policy,test on-event="cloud-backup"\n\n# 4. Status Notifikasi\n:log info "MikroTik Backup: 1-Click Setup Berhasil! Script & Scheduler telah aktif."\n:put "[OK] 1-Click Setup BERHASIL! Script ''cloud-backup'' & Scheduler ''daily-cloud-backup'' aktif."\n:put "[INFO] Anda dapat menguji backup sekarang dengan: /system script run cloud-backup"',
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
