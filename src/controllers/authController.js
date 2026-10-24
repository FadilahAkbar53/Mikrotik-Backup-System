const db = require('../config/database');
const bcrypt = require('bcryptjs');

module.exports = {
    showLogin(req, res) {
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
                req.flash('error', 'Kredensial login tidak cocok dengan data kami.');
                return res.redirect('/login');
            }

            // Verify password using bcryptjs (supports Laravel $2y$ and $2a$ / $2b$ hashes)
            const isValid = bcrypt.compareSync(password, user.password);
            if (!isValid) {
                req.flash('error', 'Kredensial login tidak cocok dengan data kami.');
                return res.redirect('/login');
            }

            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            };

            const returnTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;

            req.flash('success', `Selamat datang kembali, ${user.name}!`);
            return res.redirect(returnTo);
        } catch (err) {
            console.error('Login error:', err);
            req.flash('error', 'Terjadi kesalahan sistem saat proses login: ' + err.message);
            return res.redirect('/login');
        }
    },

    showRegister(req, res) {
        res.render('auth/register', {
            title: 'Registrasi Akun',
            layout: false
        });
    },

    async register(req, res) {
        try {
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
            req.session.user = {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            };

            req.flash('success', 'Akun berhasil didaftarkan! Selamat datang di MikBack!');
            return res.redirect('/dashboard');
        } catch (err) {
            console.error('Register error:', err);
            req.flash('error', 'Gagal mendaftarkan akun: ' + err.message);
            return res.redirect('/register');
        }
    },

    logout(req, res) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
};