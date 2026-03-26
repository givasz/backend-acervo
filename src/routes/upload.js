const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  }
});

// POST /api/upload/cover — upload capa e atualiza collection ou album
router.post('/cover', authMiddleware, upload.single('cover'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const url = `/uploads/${req.file.filename}`;
    const { type, id } = req.body; // type: 'collection' | 'album'

    if (type === 'collection' && id) {
      await db.execute({ sql: `UPDATE collections SET cover_image = ?, updated_at = NOW() WHERE id = ?`, args: [url, id] });
    } else if (type === 'album' && id) {
      await db.execute({ sql: `UPDATE albums SET cover_image = ?, updated_at = NOW() WHERE id = ?`, args: [url, id] });
    }

    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
