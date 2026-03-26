const router = require('express').Router();
const { prisma } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// GET /api/collections — public
router.get('/', async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      where: { published: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { albums: { where: { published: true } } } } },
    });
    res.json(collections.map(c => ({ ...c, album_count: c._count.albums, _count: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/collections/all — admin
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { albums: true } } },
    });
    res.json(collections.map(c => ({ ...c, album_count: c._count.albums, _count: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/collections/:slug — public
router.get('/:slug', async (req, res) => {
  try {
    const collection = await prisma.collection.findFirst({
      where: { slug: req.params.slug, published: true },
      include: { albums: { where: { published: true }, orderBy: { order: 'asc' } } },
    });
    if (!collection) return res.status(404).json({ error: 'Coleção não encontrada' });
    res.json(collection);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/collections — admin
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, cover_image, order, published } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const collection = await prisma.collection.create({
      data: {
        name,
        slug: slugify(name),
        description: description || null,
        cover_image: cover_image || null,
        order: order ?? 0,
        published: published !== false,
      },
    });
    res.status(201).json(collection);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/collections/:id — admin
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, cover_image, order, published } = req.body;
    const data = {};
    if (name !== undefined)        { data.name = name; data.slug = slugify(name); }
    if (description !== undefined) data.description = description;
    if (cover_image !== undefined) data.cover_image = cover_image;
    if (order !== undefined)       data.order = order;
    if (published !== undefined)   data.published = Boolean(published);
    const collection = await prisma.collection.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(collection);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/collections/:id — admin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.collection.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Coleção removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
