const db = require('../config/database');

module.exports = {
    async index(req, res) {
        try {
            const templates = await db('script_templates').orderBy('id', 'asc');
            return res.render('admin/templates/index', {
                title: 'Template Script MikroTik',
                templates
            });
        } catch (err) {
            console.error('Templates index error:', err);
            req.flash('error', 'Gagal memuat template: ' + err.message);
            return res.redirect('/dashboard');
        }
    },

    async edit(req, res) {
        try {
            const { id } = req.params;
            const template = await db('script_templates').where('id', id).first();
            if (!template) {
                req.flash('error', 'Template script tidak ditemukan.');
                return res.redirect('/admin/templates');
            }

            return res.render('admin/templates/edit', {
                title: `Edit Template - ${template.name}`,
                template
            });
        } catch (err) {
            req.flash('error', err.message);
            return res.redirect('/admin/templates');
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, description, content, is_active } = req.body;

            const tpl = await db('script_templates').where('id', id).first();
            if (!tpl) {
                req.flash('error', 'Template script tidak ditemukan.');
                return res.redirect('/admin/templates');
            }

            await db('script_templates').where('id', id).update({
                name: name ? name.trim() : tpl.name,
                description: description !== undefined ? description.trim() : tpl.description,
                content: content !== undefined ? content : tpl.content,
                is_active: is_active === '1' || is_active === 'true' || is_active === 'on' ? 1 : 0,
                updated_at: db.fn.now()
            });

            req.flash('success', `Template script '${name || tpl.name}' berhasil diperbarui.`);
            return res.redirect('/admin/templates');
        } catch (err) {
            req.flash('error', 'Gagal memperbarui template: ' + err.message);
            return res.redirect(`/admin/templates/${req.params.id}/edit`);
        }
    },

    async reset(req, res) {
        try {
            const { id } = req.params;
            const template = await db('script_templates').where('id', id).first();
            if (!template) {
                req.flash('error', 'Template tidak ditemukan.');
                return res.redirect('/admin/templates');
            }

            if (template.default_content !== null) {
                await db('script_templates').where('id', id).update({
                    content: template.default_content,
                    updated_at: db.fn.now()
                });
            }

            req.flash('success', `Template script '${template.name}' berhasil dikembalikan ke script bawaan.`);
            return res.redirect(`/admin/templates/${id}/edit`);
        } catch (err) {
            req.flash('error', 'Gagal me-reset template: ' + err.message);
            return res.redirect('/admin/templates');
        }
    }
};
