const db = require('../config/database');
const bcrypt = require('bcryptjs');
const activityLogService = require('../services/activityLogService');
const settingService = require('../services/settingService');

module.exports = {
    showLogin(req, res) {
        if (req.query.expired === 'idle') {
            const idleMins = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '120', 10);
            const timeText = idleMins >= 60 ? `${(idleMins / 60).toFixed(idleMins % 60 === 0 ? 0 : 1)} jam` : `${idleMins} menit`;
            req.flash('info', `Sesi Anda telah berakhir secara otomatis karena tidak ada aktivitas selama lebih dari ${timeText}. Silakan login kembali demi keamanan akun.`);
        } else if (req.query.expired === 'max') {
            req.flash('info', 'Batas waktu maksimal sesi login Anda telah selesai. Silakan login kembali demi keamanan.');
        } else if (req.query.expired === 'suspended') {
            req.flash('error', 'Akun Anda telah dinonaktifkan oleh Administrator.');
        }
        res.render('auth/login', {
            title: 'Login',
            layout: false
        });
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                req.flash('error', 'Email dan password wajib diisi.');
                return res.redirect('/login');
            }

            const user = await db('users').where({ email }).first();
            if (!user) {
                activityLogService.log({
                    type: 'auth',
                    action: 'Percobaan Login Gagal',
                    description: `Percobaan login gagal: email '${email}' tidak ditemukan di sistem`,
                    ipAddress: req.ip,
                    status: 'warning'
                });
                req.flash('error', 'Kredensial login tidak cocok dengan data kami.');
                return res.redirect('/login');
            }

            // Check if user is currently locked out (Item I: Account Lockout Policy)
            const now = new Date();
            if (user.lockout_until && new Date(user.lockout_until) > now) {
                const remainingMinutes = Math.ceil((new Date(user.lockout_until) - now) / 60000);
                activityLogService.log({
                    userId: user.id,
                    type: 'auth_lockout',
                    action: 'Login Ditolak: Akun Terkunci',
                    description: `Upaya login ke akun '${user.name}' (${user.email}) ditolak karena akun sedang dikunci sementara (${remainingMinutes} menit tersisa)`,
                    ipAddress: req.ip,
                    status: 'warning'
                });
                req.flash('error', `Akun Anda sedang dikunci sementara demi keamanan karena terlalu banyak kesalahan password. Silakan coba lagi dalam ${remainingMinutes} menit.`);
                return res.redirect('/login');
            }

            // Verify password using bcryptjs (supports Laravel $2y$ and $2a$ / $2b$ hashes)
            const isValid = bcrypt.compareSync(password, user.password);
            if (!isValid) {
                const MAX_FAILED_ATTEMPTS = 5;
                const LOCKOUT_MINUTES = 15;
                const newFailedCount = (user.failed_login_count || 0) + 1;

                if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
                    const lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
                    await db('users').where({ id: user.id }).update({
                        failed_login_count: newFailedCount,
                        lockout_until: lockoutUntil,
                        updated_at: db.fn.now()
                    });

                    activityLogService.log({
                        userId: user.id,
                        type: 'auth_lockout',
                        action: 'Akun Terkunci Otomatis',
                        description: `Akun '${user.name}' (${user.email}) otomatis dikunci sementara selama 15 menit setelah 5 kali salah memasukkan kata sandi berturut-turut`,
                        ipAddress: req.ip,
                        status: 'warning'
                    });

                    req.flash('error', `Akun Anda telah dikunci sementara selama 15 menit karena 5 kali percobaan login yang salah berturut-turut. Hubungi administrator jika membutuhkan bantuan.`);
                    return res.redirect('/login');
                } else {
                    await db('users').where({ id: user.id }).update({
                        failed_login_count: newFailedCount,
                        updated_at: db.fn.now()
                    });

                    const remainingTries = MAX_FAILED_ATTEMPTS - newFailedCount;
                    activityLogService.log({
                        userId: user.id,
                        type: 'auth',
                        action: 'Percobaan Login Gagal',
                        description: `Percobaan login gagal untuk email '${email}': password salah (Percobaan ${newFailedCount}/${MAX_FAILED_ATTEMPTS})`,
                        ipAddress: req.ip,
                        status: 'warning'
                    });

                    req.flash('error', `Kredensial login tidak cocok. Sisa percobaan: ${remainingTries} kali lagi sebelum akun dikunci sementara.`);
                    return res.redirect('/login');
                }
            }

            // Password is valid - reset failed attempts and lockout timestamp
            if ((user.failed_login_count || 0) > 0 || user.lockout_until) {
                await db('users').where({ id: user.id }).update({
                    failed_login_count: 0,
                    lockout_until: null,
                    updated_at: db.fn.now()
                });
            }

            // Check if account is suspended / inactive
            if (user.is_active === 0 || user.is_active === false) {
                activityLogService.log({
                    userId: user.id,
                    type: 'auth',
                    action: 'Login Ditolak: Akun Dinonaktifkan',
                    description: `Pengguna '${user.name}' (${user.email}) ditolak login karena status akun dinonaktifkan (suspended)`,
                    ipAddress: req.ip,
                    status: 'warning'
                });
                req.flash('error', 'Akun Anda telah dinonaktifkan oleh Administrator. Silakan hubungi admin untuk informasi lebih lanjut.');
                return res.redirect('/login');
            }

            activityLogService.log({
                userId: user.id,
                type: 'auth',
                action: 'Login Berhasil',
                description: `Pengguna '${user.name}' (${user.email}) berhasil login dengan peran '${user.role}'`,
                ipAddress: req.ip,
                status: 'success'
            });

            const returnTo = req.session.returnTo || '/dashboard';

            // Regenerate session to prevent Session Fixation attacks
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error on login:', err);
                    req.flash('error', 'Gagal memproses sesi login.');
                    return res.redirect('/login');
                }

                req.session.user = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                };
                req.session.loginAt = Date.now();
                req.session.lastActivity = Date.now();

                req.flash('success', `Selamat datang kembali, ${user.name}!`);
                return res.redirect(returnTo);
            });
        } catch (err) {
            console.error('Login error:', err);
            req.flash('error', 'Terjadi kesalahan sistem saat proses login: ' + err.message);
            return res.redirect('/login');
        }
    },

    async showRegister(req, res) {
        const allowed = await settingService.getBoolean('allow_registration', true);
        if (!allowed) {
            req.flash('info', 'Pendaftaran akun baru saat ini ditutup oleh Administrator.');
            return res.redirect('/login');
        }
        res.render('auth/register', {
            title: 'Registrasi Akun',
            layout: false
        });
    },

    async register(req, res) {
        try {
            const allowed = await settingService.getBoolean('allow_registration', true);
            if (!allowed) {
                req.flash('error', 'Pendaftaran akun baru saat ini ditutup oleh Administrator.');
                return res.redirect('/login');
            }

            const { name, email, password, password_confirmation } = req.body;
            if (!name || !email || !password) {
                req.flash('error', 'Semua bidang formulir wajib diisi.');
                return res.redirect('/register');
            }

            if (password !== password_confirmation) {
                req.flash('error', 'Konfirmasi password tidak cocok.');
                return res.redirect('/register');
            }

            if (password.length < 8) {
                req.flash('error', 'Password minimal terdiri dari 8 karakter.');
                return res.redirect('/register');
            }

            const existing = await db('users').where({ email }).first();
            if (existing) {
                req.flash('error', 'Email sudah terdaftar. Silakan gunakan email lain atau login.');
                return res.redirect('/register');
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            const [newId] = await db('users').insert({
                name,
                email,
                password: hashedPassword,
                role: 'user',
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });

            const newUser = await db('users').where('id', newId).first();

            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error on register:', err);
                    req.flash('error', 'Akun berhasil dibuat, silakan login.');
                    return res.redirect('/login');
                }

                req.session.user = {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role
                };
                req.session.loginAt = Date.now();
                req.session.lastActivity = Date.now();

                req.flash('success', 'Akun berhasil didaftarkan! Selamat datang di MikBack!');
                return res.redirect('/dashboard');
            });
        } catch (err) {
            console.error('Register error:', err);
            req.flash('error', 'Gagal mendaftarkan akun: ' + err.message);
            return res.redirect('/register');
        }
    },

    logout(req, res) {
        if (req.session && req.session.user) {
            activityLogService.log({
                userId: req.session.user.id,
                type: 'auth',
                action: 'Pengguna Logout',
                description: `Pengguna '${req.session.user.name}' mengakhiri sesi login`,
                ipAddress: req.ip,
                status: 'info'
            });
        }
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
};