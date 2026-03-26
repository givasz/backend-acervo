const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const WATERMARK_TEXT = 'Acervo Maria da Conceição';

async function applyWatermark(filePath) {
  try {
    const img = sharp(filePath);
    const { width, height } = await img.metadata();
    const fontSize = Math.max(13, Math.round(Math.min(width, height) * 0.028));
    const pad = Math.round(fontSize * 1.0);
    const charW = fontSize * 0.52;
    const svgW = Math.round(WATERMARK_TEXT.length * charW) + pad * 2;
    const svgH = Math.round(fontSize * 1.8);

    const svg = Buffer.from(
      `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${pad}" y="${svgH - Math.round(fontSize * 0.3)}" ` +
      `font-family="Georgia, serif" font-size="${fontSize}" ` +
      `fill="rgba(255,255,255,0.55)" ` +
      `stroke="rgba(0,0,0,0.35)" stroke-width="0.8">${WATERMARK_TEXT}</text>` +
      `</svg>`
    );

    const tmp = filePath + '.wm';
    await img.composite([{ input: svg, gravity: 'southeast' }]).toFile(tmp);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.warn('Watermark falhou (ignorando):', err.message);
  }
}

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.tif', '.tiff']);

function isDocumentFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  return DOCUMENT_EXTENSIONS.has(ext) ||
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'image/tiff' ||
    file.mimetype === 'image/x-tiff' ||
    file.mimetype === 'application/x-pdf';
}

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      isDocumentFile(file)
    ) cb(null, true);
    else cb(new Error('Apenas imagens, vídeos e documentos (PDF, TIFF) são permitidos'));
  }
});

// GET /api/images?album_id=X — public
router.get('/', async (req, res) => {
  try {
    const { album_id } = req.query;
    let sql = `SELECT i.*, m.collection_name, m.tipo_acervo, m.numero_registro, m.fundo, m.funcao, m.data_producao, m.local, m.genero, m.tipo_documental, m.suporte, m.dimensoes, m.autor_producao, m.conteudo, m.tags, m.extra_fields FROM images i LEFT JOIN image_metadata m ON m.image_id = i.id`;
    const args = [];
    if (album_id) { sql += ' WHERE i.album_id = ?'; args.push(album_id); }
    sql += ' ORDER BY i."order" ASC';
    const { rows } = await db.execute({ sql, args });
    const parsed = rows.map(r => ({ ...r, extra_fields: r.extra_fields ? JSON.parse(r.extra_fields) : [] }));
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/images/:id — public
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql: `SELECT i.*, a.title as album_title, a.id as album_id, c.name as collection_name_nav, c.slug as collection_slug,
            m.collection_name, m.tipo_acervo, m.numero_registro, m.fundo, m.funcao, m.data_producao, m.local, m.genero, m.tipo_documental, m.suporte, m.dimensoes, m.autor_producao, m.conteudo, m.tags, m.extra_fields
            FROM images i
            LEFT JOIN albums a ON a.id = i.album_id
            LEFT JOIN collections c ON c.id = a.collection_id
            LEFT JOIN image_metadata m ON m.image_id = i.id
            WHERE i.id = ?`,
      args: [req.params.id]
    });
    if (!rows[0]) return res.status(404).json({ error: 'Imagem não encontrada' });
    const img = rows[0];
    res.json({ ...img, extra_fields: img.extra_fields ? JSON.parse(img.extra_fields) : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/images/upload — admin
router.post('/upload', authMiddleware, upload.array('images', 50), async (req, res) => {
  try {
    const { album_id } = req.body;
    if (!album_id) return res.status(400).json({ error: 'album_id é obrigatório' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    const inserted = [];
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video/');
      const isDocument = isDocumentFile(file);
      if (!isVideo && !isDocument) await applyWatermark(file.path);
      const mediaType = isVideo ? 'video' : isDocument ? 'document' : 'image';
      const url = `/uploads/${file.filename}`;
      const result = await db.execute({
        sql: `INSERT INTO images (filename, url, title, album_id, media_type) VALUES (?,?,?,?,?) RETURNING id`,
        args: [file.filename, url, file.originalname.replace(/\.[^/.]+$/, ''), album_id, mediaType]
      });
      const { rows } = await db.execute({ sql: 'SELECT * FROM images WHERE id = ?', args: [result.lastInsertRowid] });
      inserted.push(rows[0]);
    }
    res.status(201).json(inserted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/images/:id — admin
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, order } = req.body;
    await db.execute({
      sql: `UPDATE images SET title=COALESCE(?,title), "order"=COALESCE(?,\"order\"), updated_at=NOW() WHERE id=?`,
      args: [title || null, order ?? null, req.params.id]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM images WHERE id = ?', args: [req.params.id] });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/images/:id/metadata — admin
router.put('/:id/metadata', authMiddleware, async (req, res) => {
  try {
    const { collection_name, tipo_acervo, numero_registro, fundo, funcao, data_producao, local, genero, tipo_documental, suporte, dimensoes, autor_producao, conteudo, tags, extra_fields } = req.body;
    const extraJson = extra_fields ? JSON.stringify(extra_fields) : null;
    const existing = await db.execute({ sql: 'SELECT id FROM image_metadata WHERE image_id = ?', args: [req.params.id] });
    if (existing.rows.length > 0) {
      await db.execute({
        sql: `UPDATE image_metadata SET collection_name=?, tipo_acervo=?, numero_registro=?, fundo=?, funcao=?, data_producao=?, local=?, genero=?, tipo_documental=?, suporte=?, dimensoes=?, autor_producao=?, conteudo=?, tags=?, extra_fields=? WHERE image_id=?`,
        args: [collection_name || null, tipo_acervo || null, numero_registro || null, fundo || null, funcao || null, data_producao || null, local || null, genero || null, tipo_documental || null, suporte || null, dimensoes || null, autor_producao || null, conteudo || null, tags || null, extraJson, req.params.id]
      });
    } else {
      await db.execute({
        sql: `INSERT INTO image_metadata (image_id, collection_name, tipo_acervo, numero_registro, fundo, funcao, data_producao, local, genero, tipo_documental, suporte, dimensoes, autor_producao, conteudo, tags, extra_fields) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [req.params.id, collection_name || null, tipo_acervo || null, numero_registro || null, fundo || null, funcao || null, data_producao || null, local || null, genero || null, tipo_documental || null, suporte || null, dimensoes || null, autor_producao || null, conteudo || null, tags || null, extraJson]
      });
    }
    const { rows } = await db.execute({ sql: 'SELECT * FROM image_metadata WHERE image_id = ?', args: [req.params.id] });
    res.json({ ...rows[0], extra_fields: rows[0].extra_fields ? JSON.parse(rows[0].extra_fields) : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/images/:id — admin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.execute({ sql: 'SELECT filename FROM images WHERE id = ?', args: [req.params.id] });
    if (rows[0]) {
      const filePath = path.join(UPLOAD_DIR, rows[0].filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.execute({ sql: 'DELETE FROM images WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Imagem removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/images/reorder — admin
router.post('/reorder', authMiddleware, async (req, res) => {
  try {
    const { orders } = req.body;
    for (const item of orders) {
      await db.execute({ sql: 'UPDATE images SET "order" = ? WHERE id = ?', args: [item.order, item.id] });
    }
    res.json({ message: 'Ordem atualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/images/search/q — public
router.get('/search/q', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const term = `%${q}%`;
    const { rows } = await db.execute({
      sql: `SELECT i.*, m.tags, m.conteudo, m.tipo_acervo, m.collection_name FROM images i LEFT JOIN image_metadata m ON m.image_id = i.id WHERE i.title ILIKE ? OR m.tags ILIKE ? OR m.conteudo ILIKE ? OR m.collection_name ILIKE ? LIMIT 50`,
      args: [term, term, term, term]
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
