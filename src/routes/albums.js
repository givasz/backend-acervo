const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// GET /api/albums?collection_id=X — public
router.get('/', async (req, res) => {
  try {
    const { collection_id } = req.query;
    let sql = `SELECT a.*, COUNT(i.id) as image_count FROM albums a LEFT JOIN images i ON i.album_id = a.id WHERE a.published = true`;
    const args = [];
    if (collection_id) { sql += ' AND a.collection_id = ?'; args.push(collection_id); }
    sql += ' GROUP BY a.id ORDER BY a."order" ASC';
    const { rows } = await db.execute({ sql, args });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/albums/all — admin
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const { collection_id } = req.query;
    let sql = `SELECT a.*, c.name as collection_name, COUNT(i.id) as image_count FROM albums a LEFT JOIN collections c ON c.id = a.collection_id LEFT JOIN images i ON i.album_id = a.id`;
    const args = [];
    if (collection_id) { sql += ' WHERE a.collection_id = ?'; args.push(collection_id); }
    sql += ' GROUP BY a.id, c.name ORDER BY a."order" ASC';
    const { rows } = await db.execute({ sql, args });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/albums/:id — public
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.execute({ sql: 'SELECT a.*, c.name as collection_name_nav, c.slug as collection_slug FROM albums a LEFT JOIN collections c ON c.id = a.collection_id WHERE a.id = ? AND a.published = true', args: [req.params.id] });
    if (!rows[0]) return res.status(404).json({ error: 'Álbum não encontrado' });
    const album = rows[0];
    const images = await db.execute({ sql: 'SELECT i.*, m.* FROM images i LEFT JOIN image_metadata m ON m.image_id = i.id WHERE i.album_id = ? ORDER BY i."order" ASC', args: [album.id] });
    res.json({ ...album, images: images.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/albums — admin
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, cover_image, order, published, collection_id } = req.body;
    if (!title || !collection_id) return res.status(400).json({ error: 'Título e coleção são obrigatórios' });
    const slug = slugify(title);
    const result = await db.execute({
      sql: `INSERT INTO albums (title, slug, description, cover_image, "order", published, collection_id) VALUES (?,?,?,?,?,?,?) RETURNING id`,
      args: [title, slug, description || null, cover_image || null, order ?? 0, published !== false, collection_id]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM albums WHERE id = ?', args: [result.lastInsertRowid] });
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/albums/:id — admin
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, cover_image, order, published, collection_id } = req.body;
    const slug = title ? slugify(title) : undefined;
    await db.execute({
      sql: `UPDATE albums SET title=COALESCE(?,title), slug=COALESCE(?,slug), description=?, cover_image=COALESCE(?,cover_image), "order"=COALESCE(?,\"order\"), published=COALESCE(?,published), collection_id=COALESCE(?,collection_id), updated_at=NOW() WHERE id=?`,
      args: [title || null, slug || null, description ?? null, cover_image || null, order ?? null, published !== undefined ? Boolean(published) : null, collection_id || null, req.params.id]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM albums WHERE id = ?', args: [req.params.id] });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/albums/:id — admin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM albums WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Álbum removido' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
