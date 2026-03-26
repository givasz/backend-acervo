const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { prisma } = require('../db/database');
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
      `fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.35)" stroke-width="0.8">${WATERMARK_TEXT}</text>` +
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
  },
});
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.tif', '.tiff']);
function isDocumentFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  return DOCUMENT_EXTENSIONS.has(ext) || ['application/pdf', 'image/tiff', 'image/x-tiff', 'application/x-pdf'].includes(file.mimetype);
}
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || isDocumentFile(file))
      cb(null, true);
    else cb(new Error('Apenas imagens, vídeos e documentos (PDF, TIFF) são permitidos'));
  },
});

function flattenImage(img) {
  const { metadata, ...rest } = img;
  return {
    ...rest,
    ...(metadata || {}),
    extra_fields: metadata?.extra_fields ? JSON.parse(metadata.extra_fields) : [],
  };
}

// GET /api/images?album_id=X — public
router.get('/', async (req, res) => {
  try {
    const { album_id } = req.query;
    const images = await prisma.image.findMany({
      where: album_id ? { album_id: Number(album_id) } : {},
      orderBy: { order: 'asc' },
      include: { metadata: true },
    });
    res.json(images.map(flattenImage));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/images/:id — public
router.get('/:id', async (req, res) => {
  try {
    const img = await prisma.image.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        metadata: true,
        album: {
          select: { id: true, title: true, collection: { select: { name: true, slug: true } } },
        },
      },
    });
    if (!img) return res.status(404).json({ error: 'Imagem não encontrada' });
    const { album, metadata, ...rest } = img;
    res.json({
      ...rest,
      ...(metadata || {}),
      extra_fields: metadata?.extra_fields ? JSON.parse(metadata.extra_fields) : [],
      album_id: album?.id,
      album_title: album?.title,
      collection_name_nav: album?.collection?.name,
      collection_slug: album?.collection?.slug,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/images/upload — admin
router.post('/upload', authMiddleware, upload.array('images', 50), async (req, res) => {
  try {
    const { album_id } = req.body;
    if (!album_id) return res.status(400).json({ error: 'album_id é obrigatório' });
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    const inserted = [];
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video/');
      const isDocument = isDocumentFile(file);
      if (!isVideo && !isDocument) await applyWatermark(file.path);
      const img = await prisma.image.create({
        data: {
          filename: file.filename,
          url: `/uploads/${file.filename}`,
          title: file.originalname.replace(/\.[^/.]+$/, ''),
          album_id: Number(album_id),
          media_type: isVideo ? 'video' : isDocument ? 'document' : 'image',
        },
      });
      inserted.push(img);
    }
    res.status(201).json(inserted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/images/:id — admin
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, order } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (order !== undefined) data.order = order;
    const img = await prisma.image.update({ where: { id: Number(req.params.id) }, data });
    res.json(img);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/images/:id/metadata — admin
router.put('/:id/metadata', authMiddleware, async (req, res) => {
  try {
    const { collection_name, tipo_acervo, numero_registro, fundo, funcao, data_producao,
            local, genero, tipo_documental, suporte, dimensoes, autor_producao,
            conteudo, tags, extra_fields } = req.body;

    const data = {
      collection_name: collection_name || null,
      tipo_acervo: tipo_acervo || null,
      numero_registro: numero_registro || null,
      fundo: fundo || null,
      funcao: funcao || null,
      data_producao: data_producao || null,
      local: local || null,
      genero: genero || null,
      tipo_documental: tipo_documental || null,
      suporte: suporte || null,
      dimensoes: dimensoes || null,
      autor_producao: autor_producao || null,
      conteudo: conteudo || null,
      tags: tags || null,
      extra_fields: extra_fields ? JSON.stringify(extra_fields) : null,
    };

    const metadata = await prisma.imageMetadata.upsert({
      where: { image_id: Number(req.params.id) },
      update: data,
      create: { image_id: Number(req.params.id), ...data },
    });
    res.json({ ...metadata, extra_fields: metadata.extra_fields ? JSON.parse(metadata.extra_fields) : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/images/:id — admin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const img = await prisma.image.findUnique({ where: { id: Number(req.params.id) } });
    if (img) {
      const filePath = path.join(UPLOAD_DIR, img.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.image.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Imagem removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/images/reorder — admin
router.post('/reorder', authMiddleware, async (req, res) => {
  try {
    const { orders } = req.body;
    await Promise.all(
      orders.map(item => prisma.image.update({ where: { id: item.id }, data: { order: item.order } }))
    );
    res.json({ message: 'Ordem atualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/images/search/q — public
router.get('/search/q', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const images = await prisma.image.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { metadata: { tags: { contains: q, mode: 'insensitive' } } },
          { metadata: { conteudo: { contains: q, mode: 'insensitive' } } },
          { metadata: { collection_name: { contains: q, mode: 'insensitive' } } },
          { metadata: { tipo_acervo: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { metadata: true },
      take: 50,
    });
    res.json(images.map(flattenImage));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
