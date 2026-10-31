const fs = require('fs');
const readline = require('readline');
const path = require('path');
const db = require('../config/database');

const MONTH_MAP = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    mei: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    agu: '08',
    sep: '09',
    oct: '10',
    okt: '10',
    nov: '11',
    dec: '12',
    des: '12'
};

const INDONESIAN_MONTHS = {
    '01': 'Januari',
    '02': 'Februari',
    '03': 'Maret',
    '04': 'April',
    '05': 'Mei',
    '06': 'Juni',
    '07': 'Juli',
    '08': 'Agustus',
    '09': 'September',
    '10': 'Oktober',
    '11': 'November',
    '12': 'Desember'
};

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function resolvePhysicalPath(filePath) {
    if (!filePath) return null;
    if (path.isAbsolute(filePath)) return fs.existsSync(filePath) ? filePath : null;

    const cwd = process.cwd();
    const candidates = [
        path.join(cwd, filePath),
        path.join(cwd, 'storage', filePath),
        path.join(cwd, 'express-app', 'storage', filePath),
        path.join(cwd, 'storage', 'app', filePath),
        (filePath.startsWith('storage/') || filePath.startsWith('storage\\')) ? path.join(cwd, filePath.replace(/^storage[\/\\]/, '')) : null,
        (filePath.startsWith('storage/') || filePath.startsWith('storage\\')) ? path.join(cwd, 'express-app', filePath) : null
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return null;
}

class VoucherReportService {
    /**
     * Parse raw MikroTik Mikhmon date string (e.g. "mar/01/2026") into ISO SQL date and month
     */
    parseDateAndMonth(dateStr, timeStr = '00:00:00') {
        if (!dateStr) return null;
        const clean = dateStr.trim().toLowerCase();
        const parts = clean.split('/');

        let year, month, day;

        if (parts.length === 3) {
            // Format: mmm/dd/yyyy (standard Mikhmon: e.g. mar/01/2026)
            if (MONTH_MAP[parts[0]]) {
                month = MONTH_MAP[parts[0]];
                day = parts[1].padStart(2, '0');
                year = parts[2];
            } else if (parts[0].length === 4) {
                // yyyy/mm/dd
                year = parts[0];
                month = parts[1].padStart(2, '0');
                day = parts[2].padStart(2, '0');
            } else {
                // mm/dd/yyyy
                month = parts[0].padStart(2, '0');
                day = parts[1].padStart(2, '0');
                year = parts[2];
            }
        } else if (clean.includes('-')) {
            const dashes = clean.split('-');
            if (dashes[0].length === 4) {
                year = dashes[0];
                month = dashes[1].padStart(2, '0');
                day = dashes[2].padStart(2, '0');
            }
        }

        if (!year || !month || !day) return null;

        let cleanTime = (timeStr || '00:00:00').trim();
        if (!/^\d{2}:\d{2}:\d{2}$/.test(cleanTime)) {
            cleanTime = '00:00:00';
        }

        return {
            sale_date: `${year}-${month}-${day}`,
            sale_month: `${year}-${month}`,
            sale_time: cleanTime
        };
    }

    /**
     * Stream parse a MikroTik .rsc backup file for Mikhmon voucher script records
     */
    async parseRscFile(filePath, routerId) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File backup tidak ditemukan: ${filePath}`);
        }

        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        const records = [];
        let currentCmd = '';

        for await (const line of rl) {
            if (currentCmd) {
                currentCmd += '\n' + line;
                if (!line.endsWith('\\')) {
                    if (currentCmd.includes('comment=mikhmon') && currentCmd.includes('name=')) {
                        const parsed = this.extractRecordFromCommand(currentCmd, routerId);
                        if (parsed) records.push(parsed);
                    }
                    currentCmd = '';
                }
            } else if (line.trim().startsWith('add ') && line.includes('comment=mikhmon')) {
                if (line.endsWith('\\')) {
                    currentCmd = line;
                } else {
                    const parsed = this.extractRecordFromCommand(line, routerId);
                    if (parsed) records.push(parsed);
                }
            }
        }

        return records;
    }

    /**
     * Extract structured voucher record from raw /system script add command string
     */
    extractRecordFromCommand(cmd, routerId) {
        const match = cmd.match(/name="([^"]+)"/s);
        if (!match) return null;

        // Clean out MikroTik line wraps within the string
        const rawName = match[1].replace(/\\\r?\n\s*(\\_)?/g, '');
        const parts = rawName.split('-|-');
        if (parts.length < 8) return null;

        const dateStr = parts[0];
        const timeStr = parts[1];
        const voucherCode = (parts[2] || '').trim();
        const price = parseFloat(parts[3]) || 0;
        const ip = (parts[4] || '').trim();
        const mac = (parts[5] || '').trim();
        const validity = (parts[6] || '').trim();
        const profile = (parts[7] || 'UNKNOWN').trim();
        const comment = (parts[8] || '').trim();

        if (!voucherCode) return null;

        const parsedDate = this.parseDateAndMonth(dateStr, timeStr);
        if (!parsedDate) return null;

        return {
            router_id: routerId,
            voucher_code: voucherCode,
            price,
            profile,
            validity,
            ip_address: ip || null,
            mac_address: mac || null,
            comment: comment || null,
            sale_date: parsedDate.sale_date,
            sale_time: parsedDate.sale_time,
            sale_month: parsedDate.sale_month,
            raw_date_str: dateStr
        };
    }

    /**
     * Synchronize and insert all voucher records from a .rsc file into database
     */
    async syncFromRscFile(routerId, filePath) {
        console.log(`[VoucherReport] Starting sync for router ID ${routerId} from file: ${filePath}`);

        // Cross-router check: Ensure the file doesn't match another router
        const router = await db('routers').where('id', routerId).first();
        if (router) {
            const fileName = path.basename(filePath).toLowerCase();
            const otherRouters = await db('routers').whereNot('id', routerId).select('id', 'name');
            const otherSlugs = otherRouters.map(r => ({ name: r.name, slug: slugify(r.name || '') })).filter(r => r.slug.length >= 3);
            const matchedOther = otherSlugs.find(o => fileName.includes(o.slug));
            if (matchedOther) {
                console.warn(`[VoucherReport] Blocked auto-sync: File '${path.basename(filePath)}' matches another router '${matchedOther.name}'. Skipping parsing for router '${router.name}'.`);
                return { totalParsed: 0, newInserted: 0, totalExisting: 0, skipped: true };
            }
        }

        const records = await this.parseRscFile(filePath, routerId);
        console.log(`[VoucherReport] Parsed ${records.length} voucher records from file.`);

        if (records.length === 0) {
            return { totalParsed: 0, newInserted: 0, totalExisting: 0 };
        }

        const countBeforeRow = await db('voucher_reports').where('router_id', routerId).count('id as count').first();
        const countBefore = parseInt(countBeforeRow.count, 10) || 0;

        // Batch insert in chunks of 500 for optimal speed and safety
        const chunkSize = 500;
        for (let i = 0; i < records.length; i += chunkSize) {
            const chunk = records.slice(i, i + chunkSize);
            await db('voucher_reports')
                .insert(chunk)
                .onConflict(['router_id', 'voucher_code', 'sale_date', 'sale_time'])
                .ignore();
        }

        const countAfterRow = await db('voucher_reports').where('router_id', routerId).count('id as count').first();
        const countAfter = parseInt(countAfterRow.count, 10) || 0;
        const newInserted = countAfter - countBefore;

        console.log(`[VoucherReport] Sync finished for router ID ${routerId}. Inserted: ${newInserted}, Total in DB: ${countAfter}`);
        return {
            totalParsed: records.length,
            newInserted,
            totalExisting: countAfter
        };
    }

    /**
     * Synchronize voucher reports from ALL available .rsc backups for a router.
     * - Scans all .rsc backup records for this router across days and months.
     * - Gracefully handles files that may have been pruned or missing on current machine.
     * - Merges any days that were skipped or missing in newer files from older backups.
     * - Guarantees 0% duplicates through DB composite unique key (router_id, voucher_code, sale_date, sale_time).
     * - Supports fresh rebuild: options.fresh = true to clear stale/foreign data before re-parsing.
     */
    async syncAllRscFiles(routerId, options = {}) {
        const fresh = options.fresh === true || options.clean === true;
        const router = await db('routers').where('id', routerId).first();
        if (!router) {
            throw new Error('Router tidak ditemukan.');
        }

        // 1. Gather all RSC backups recorded in DB strictly for THIS router
        const dbBackups = await db('backups')
            .where('router_id', routerId)
            .where('file_type', 'rsc')
            .orderBy('created_at', 'desc');

        const existingFilePaths = new Set();

        for (const b of dbBackups) {
            const resolved = resolvePhysicalPath(b.file_path);
            if (resolved) {
                existingFilePaths.add(resolved);
            }
        }

        // 2. Also check physical storage folders belonging to this router
        const routerSlug = slugify(router.name || '');
        const searchDirs = [
            path.join(process.cwd(), 'storage', 'backups', `user_${router.user_id}`, routerSlug),
            path.join(process.cwd(), 'express-app', 'storage', 'backups', `user_${router.user_id}`, routerSlug)
        ];

        for (const specificRouterDir of searchDirs) {
            if (fs.existsSync(specificRouterDir)) {
                const scanDir = (dir) => {
                    try {
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            const full = path.join(dir, entry.name);
                            if (entry.isDirectory()) {
                                scanDir(full);
                            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.rsc')) {
                                existingFilePaths.add(full);
                            }
                        }
                    } catch (e) {
                        console.warn(`[VoucherReport] Error scanning dir ${dir}:`, e.message);
                    }
                };
                scanDir(specificRouterDir);
            }
        }

        // 3. Filter out files that match a DIFFERENT registered router in the database (cross-token contamination)
        const otherRouters = await db('routers').whereNot('id', routerId).select('id', 'name');
        const otherSlugs = otherRouters.map(r => ({
            name: r.name,
            slug: slugify(r.name || '')
        })).filter(r => r.slug.length >= 3);

        const validFilePaths = [];
        for (const filePath of existingFilePaths) {
            const fileName = path.basename(filePath).toLowerCase();
            const matchedOther = otherSlugs.find(o => fileName.includes(o.slug));
            if (matchedOther) {
                console.warn(`[VoucherReport] Skipping foreign file '${path.basename(filePath)}' belonging to other router '${matchedOther.name}' during sync of router '${router.name}'.`);
                continue;
            }
            validFilePaths.push(filePath);
        }

        // If fresh sync requested, wipe existing voucher report records for this router now
        if (fresh) {
            await db('voucher_reports').where('router_id', routerId).delete();
            console.log(`[VoucherReport] Cleared all existing voucher report records for router ${routerId} (${router.name}) for fresh rebuild.`);
        }

        if (validFilePaths.length === 0) {
            if (fresh) {
                return {
                    filesProcessed: 0,
                    totalParsed: 0,
                    newInserted: 0,
                    totalExisting: 0,
                    fresh: true
                };
            }
            throw new Error(`Tidak ditemukan berkas backup .rsc fisik yang valid di storage untuk router '${router.name}'. Pastikan router ini telah berhasil mengunggah berkas backup .rsc.`);
        }

        console.log(`[VoucherReport] Starting multi-file sync for router ${routerId} (${router.name}) across ${validFilePaths.length} valid RSC files (fresh=${fresh})...`);

        const countBeforeRow = await db('voucher_reports').where('router_id', routerId).count('id as count').first();
        const countBefore = parseInt(countBeforeRow.count, 10) || 0;

        let totalParsedAll = 0;
        const chunkSize = 500;

        for (const filePath of validFilePaths) {
            try {
                const records = await this.parseRscFile(filePath, routerId);
                totalParsedAll += records.length;

                for (let i = 0; i < records.length; i += chunkSize) {
                    const chunk = records.slice(i, i + chunkSize);
                    await db('voucher_reports')
                        .insert(chunk)
                        .onConflict(['router_id', 'voucher_code', 'sale_date', 'sale_time'])
                        .ignore();
                }
            } catch (fileErr) {
                console.warn(`[VoucherReport] Warning reading file ${filePath}:`, fileErr.message);
            }
        }

        const countAfterRow = await db('voucher_reports').where('router_id', routerId).count('id as count').first();
        const countAfter = parseInt(countAfterRow.count, 10) || 0;
        const newInserted = countAfter - countBefore;

        console.log(`[VoucherReport] Multi-file sync finished for router ${routerId}. Files: ${validFilePaths.length}, Parsed: ${totalParsedAll}, New Inserted: ${newInserted}, Total in DB: ${countAfter}`);

        return {
            filesProcessed: validFilePaths.length,
            totalParsed: totalParsedAll,
            newInserted,
            totalExisting: countAfter,
            fresh
        };
    }

    /**
     * Alias for backward compatibility
     */
    async syncLatestRsc(routerId) {
        return await this.syncAllRscFiles(routerId);
    }

    /**
     * Get high-level summary KPIs (Total Omset, Total Voucher, Unique Profiles)
     */
    async getReportSummary(routerId, filters = {}) {
        let query = db('voucher_reports').where('router_id', routerId);

        if (filters.month) {
            query = query.where('sale_month', filters.month);
        }
        if (filters.profile) {
            query = query.where('profile', filters.profile);
        }
        if (filters.date) {
            query = query.where('sale_date', filters.date);
        }

        const stats = await query.clone().select(
            db.raw('COALESCE(SUM(price), 0) as total_revenue'),
            db.raw('COUNT(id) as total_vouchers'),
            db.raw('COUNT(DISTINCT profile) as total_profiles'),
            db.raw('COUNT(DISTINCT sale_date) as active_days'),
            db.raw('MIN(sale_date) as first_sale'),
            db.raw('MAX(sale_date) as last_sale')
        ).first();

        const totalRevenue = parseFloat(stats.total_revenue) || 0;
        const totalVouchers = parseInt(stats.total_vouchers, 10) || 0;
        const activeDays = parseInt(stats.active_days, 10) || 1;
        const avgDailyRevenue = activeDays > 0 ? Math.round(totalRevenue / activeDays) : 0;

        return {
            totalRevenue,
            totalRevenueFormatted: this.formatRupiah(totalRevenue),
            totalVouchers,
            totalProfiles: parseInt(stats.total_profiles, 10) || 0,
            activeDays,
            avgDailyRevenue,
            avgDailyRevenueFormatted: this.formatRupiah(avgDailyRevenue),
            firstSale: stats.first_sale,
            lastSale: stats.last_sale
        };
    }

    /**
     * Get Monthly Aggregations (Per Bulan)
     */
    async getMonthlyBreakdown(routerId, filters = {}) {
        let query = db('voucher_reports')
            .where('router_id', routerId);

        if (filters.profile) {
            query = query.where('profile', filters.profile);
        }

        const rows = await query
            .select(
                'sale_month',
                db.raw('COUNT(id) as total_vouchers'),
                db.raw('SUM(price) as total_revenue'),
                db.raw('COUNT(DISTINCT sale_date) as active_days')
            )
            .groupBy('sale_month')
            .orderBy('sale_month', 'desc');

        return rows.map(r => ({
            saleMonth: r.sale_month,
            monthName: this.formatMonthName(r.sale_month),
            totalVouchers: parseInt(r.total_vouchers, 10) || 0,
            totalRevenue: parseFloat(r.total_revenue) || 0,
            totalRevenueFormatted: this.formatRupiah(r.total_revenue),
            activeDays: parseInt(r.active_days, 10) || 0
        }));
    }

    /**
     * Get Profile Breakdown (Per Profile Voucher)
     */
    async getProfileBreakdown(routerId, filters = {}) {
        let query = db('voucher_reports').where('router_id', routerId);

        if (filters.month) {
            query = query.where('sale_month', filters.month);
        }

        const rows = await query
            .select(
                'profile',
                db.raw('COUNT(id) as total_vouchers'),
                db.raw('SUM(price) as total_revenue'),
                db.raw('AVG(price) as avg_price')
            )
            .groupBy('profile')
            .orderBy('total_revenue', 'desc');

        const totalSum = rows.reduce((acc, curr) => acc + (parseFloat(curr.total_revenue) || 0), 0);

        return rows.map(r => {
            const rev = parseFloat(r.total_revenue) || 0;
            const pct = totalSum > 0 ? ((rev / totalSum) * 100).toFixed(1) : '0';
            return {
                profile: r.profile,
                totalVouchers: parseInt(r.total_vouchers, 10) || 0,
                totalRevenue: rev,
                totalRevenueFormatted: this.formatRupiah(rev),
                avgPrice: Math.round(parseFloat(r.avg_price) || 0),
                avgPriceFormatted: this.formatRupiah(Math.round(parseFloat(r.avg_price) || 0)),
                percentage: pct
            };
        });
    }

    /**
     * Get Daily Breakdown (Per Tanggal)
     */
    async getDailyBreakdown(routerId, filters = {}, limit = null) {
        let query = db('voucher_reports').where('router_id', routerId);

        if (filters.month) {
            query = query.where('sale_month', filters.month);
        }
        if (filters.profile) {
            query = query.where('profile', filters.profile);
        }

        query = query
            .select(
                'sale_date',
                db.raw('COUNT(id) as total_vouchers'),
                db.raw('SUM(price) as total_revenue')
            )
            .groupBy('sale_date')
            .orderBy('sale_date', 'desc');

        if (limit) {
            query = query.limit(limit);
        }

        const rows = await query;

        return rows.map(r => ({
            saleDate: r.sale_date,
            totalVouchers: parseInt(r.total_vouchers, 10) || 0,
            totalRevenue: parseFloat(r.total_revenue) || 0,
            totalRevenueFormatted: this.formatRupiah(r.total_revenue)
        }));
    }

    /**
     * Get Paginated Detailed Voucher Transactions (Rincian Transaksi)
     */
    async getTransactions(routerId, filters = {}, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        let query = db('voucher_reports').where('router_id', routerId);

        if (filters.month) {
            query = query.where('sale_month', filters.month);
        }
        if (filters.profile) {
            query = query.where('profile', filters.profile);
        }
        if (filters.date) {
            query = query.where('sale_date', filters.date);
        }
        if (filters.search) {
            const term = `%${filters.search.trim()}%`;
            query = query.where(function() {
                this.where('voucher_code', 'like', term)
                    .orWhere('profile', 'like', term)
                    .orWhere('ip_address', 'like', term)
                    .orWhere('mac_address', 'like', term)
                    .orWhere('comment', 'like', term);
            });
        }

        const countRow = await query.clone().count('id as count').first();
        const total = parseInt(countRow.count, 10) || 0;

        const rows = await query.clone()
            .orderBy('sale_date', 'desc')
            .orderBy('sale_time', 'desc')
            .limit(limit)
            .offset(offset);

        return {
            transactions: rows.map(t => ({
                ...t,
                priceFormatted: this.formatRupiah(t.price)
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1
        };
    }

    /**
     * Get list of distinct months for dropdown filtering
     */
    async getAvailableMonths(routerId) {
        const rows = await db('voucher_reports')
            .where('router_id', routerId)
            .distinct('sale_month')
            .orderBy('sale_month', 'desc');

        return rows.map(r => ({
            value: r.sale_month,
            label: this.formatMonthName(r.sale_month)
        }));
    }

    /**
     * Get list of distinct profiles for dropdown filtering
     */
    async getAvailableProfiles(routerId) {
        const rows = await db('voucher_reports')
            .where('router_id', routerId)
            .distinct('profile')
            .orderBy('profile', 'asc');

        return rows.map(r => r.profile);
    }

    /**
     * Helpers for Indonesian Currency and Date formatting
     */
    formatRupiah(amount) {
        const val = Math.round(Number(amount) || 0);
        return 'Rp ' + val.toLocaleString('id-ID');
    }

    formatMonthName(monthStr) {
        if (!monthStr || !monthStr.includes('-')) return monthStr;
        const [year, month] = monthStr.split('-');
        const monthName = INDONESIAN_MONTHS[month] || month;
        return `${monthName} ${year}`;
    }
}

module.exports = new VoucherReportService();
