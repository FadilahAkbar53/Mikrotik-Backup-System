require('dotenv').config();
const retentionService = require('../services/retentionService');

async function run() {
    try {
        const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
        console.log(isDryRun
            ? '🔍 Menjalankan SIMULASI (Dry-Run) Pembersihan Retensi Backup MikroTik...'
            : '🧹 Menjalankan Pembersihan Retensi Backup MikroTik...'
        );

        const result = await retentionService.pruneAll(isDryRun);

        console.log('\n--- Ringkasan Retensi ---');
        console.table([
            { Parameter: 'Mode Eksekusi', Nilai: result.dry_run ? 'Simulasi (Dry-Run)' : 'Pembersihan Nyata (Live Run)' },
            { Parameter: 'Batas Simpan Maksimal', Nilai: `${result.max_months} Bulan` },
            { Parameter: 'Maksimal Hari per Bulan', Nilai: `${result.max_days_per_month} Hari Unik Terbaru` },
            { Parameter: 'Batas Tanggal Kedaluwarsa', Nilai: result.cutoff_date },
            { Parameter: 'Total Berkas Dibersihkan', Nilai: `${result.total_files_pruned} berkas` },
            { Parameter: 'Ruang Disk Dihemat', Nilai: result.total_bytes_saved_formatted }
        ]);

        if (result.details && result.details.length > 0) {
            console.log('\nRincian Berkas yang Terpangkas:');
            console.table(result.details.slice(0, 25).map(item => ({
                Router: item.router_name,
                Pemilik: item.owner_name,
                Berkas: item.filename,
                Dibuat: item.created_at,
                Alasan: item.reason
            })));
        } else {
            console.log('✓ Tidak ada berkas kedaluwarsa yang perlu dibersihkan. Seluruh data backup dalam kuota retensi yang valid.');
        }

        process.exit(0);
    } catch (e) {
        console.error('Error executing retention pruning:', e);
        process.exit(1);
    }
}

run();
