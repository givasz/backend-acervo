const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// GET /api/collections — public
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT c.*, COUNT(a.id) as album_count
       FROM collections c
       LEFT JOIN albums a ON a.collection_id = c.id AND a.published = true
       WHERE c.published = true
       GROUP BY c.id
       ORDER BY c."order" ASC, c.name ASC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/collections/all — admin only (inclui não publicados)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT c.*, COUNT(a.id) as album_count
       FROM collections c
       LEFT JOIN albums a ON a.collection_id = c.id
       GROUP BY c.id
       ORDER BY c."order" ASC, c.name ASC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/collections/:slug — public
router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await db.execute({ sql: 'SELECT * FROM collections WHERE slug = ? AND published = true', args: [req.params.slug] });
    if (!rows[0]) return res.status(404).json({ error: 'Coleção não encontrada' });
    const col = rows[0];
    const albums = await db.execute({ sql: 'SELECT * FROM albums WHERE collection_id = ? AND published = true ORDER BY "order" ASC', args: [col.id] });
    res.json({ ...col, albums: albums.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/collections — admin
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, cover_image, order, published } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const slug = slugify(name);
    const result = await db.execute({
      sql: `INSERT INTO collections (name, slug, description, cover_image, "order", published) VALUES (?,?,?,?,?,?) RETURNING id`,
      args: [name, slug, description || null, cover_image || null, order ?? 0, published !== false]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM collections WHERE id = ?', args: [result.lastInsertRowid] });
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/collections/:id — admin
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, cover_image, order, published } = req.body;
    const slug = name ? slugify(name) : undefined;
    await db.execute({
      sql: `UPDATE collections SET name=COALESCE(?,name), slug=COALESCE(?,slug), description=?, cover_image=COALESCE(?,cover_image), "order"=COALESCE(?,\"order\"), published=COALESCE(?,published), updated_at=NOW() WHERE id=?`,
      args: [name || null, slug || null, description ?? null, cover_image || null, order ?? null, published !== undefined ? Boolean(published) : null, req.params.id]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM collections WHERE id = ?', args: [req.params.id] });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/collections/:id — admin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM collections WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Coleção removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
