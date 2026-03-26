const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { prisma } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// POST /api/upload/cover
router.post('/cover', authMiddleware, upload.single('cover'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const url = `/uploads/${req.file.filename}`;
    const { type, id } = req.body;

    if (type === 'collection' && id) {
      await prisma.collection.update({ where: { id: Number(id) }, data: { cover_image: url } });
    } else if (type === 'album' && id) {
      await prisma.album.update({ where: { id: Number(id) }, data: { cover_image: url } });
    }

    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
