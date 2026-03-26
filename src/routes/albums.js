const router = require('express').Router();
const { prisma } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function flattenImage(img) {
  const { metadata, ...rest } = img;
  return {
    ...rest,
    ...(metadata || {}),
    extra_fields: metadata?.extra_fields ? JSON.parse(metadata.extra_fields) : [],
  };
}

// GET /api/albums?collection_id=X — public
router.get('/', async (req, res) => {
  try {
    const { collection_id } = req.query;
    const albums = await prisma.album.findMany({
      where: { published: true, ...(collection_id ? { collection_id: Number(collection_id) } : {}) },
      orderBy: { order: 'asc' },
      include: { _count: { select: { images: true } } },
    });
    res.json(albums.map(a => ({ ...a, image_count: a._count.images, _count: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/albums/all — admin
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const { collection_id } = req.query;
    const albums = await prisma.album.findMany({
      where: collection_id ? { collection_id: Number(collection_id) } : {},
      orderBy: { order: 'asc' },
      include: {
        collection: { select: { name: true } },
        _count: { select: { images: true } },
      },
    });
    res.json(albums.map(a => ({
      ...a,
      collection_name: a.collection?.name,
      collection: undefined,
      image_count: a._count.images,
      _count: undefined,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/albums/:id — public
router.get('/:id', async (req, res) => {
  try {
    const album = await prisma.album.findFirst({
      where: { id: Number(req.params.id), published: true },
      include: {
        collection: { select: { name: true, slug: true } },
        images: {
          orderBy: { order: 'asc' },
          include: { metadata: true },
        },
      },
    });
    if (!album) return res.status(404).json({ error: 'Álbum não encontrado' });
    res.json({
      ...album,
      collection_name_nav: album.collection?.name,
      collection_slug: album.collection?.slug,
      collection: undefined,
      images: album.images.map(flattenImage),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/albums — admin
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, cover_image, order, published, collection_id } = req.body;
    if (!title || !collection_id) return res.status(400).json({ error: 'Título e coleção são obrigatórios' });
    const album = await prisma.album.create({
      data: {
        title,
        slug: slugify(title),
        description: description || null,
        cover_image: cover_image || null,
        order: order ?? 0,
        published: published !== false,
        collection_id: Number(collection_id),
      },
    });
    res.status(201).json(album);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/albums/:id — admin
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, cover_image, order, published, collection_id } = req.body;
    const data = {};
    if (title !== undefined)        { data.title = title; data.slug = slugify(title); }
    if (description !== undefined)  data.description = description;
    if (cover_image !== undefined)  data.cover_image = cover_image;
    if (order !== undefined)        data.order = order;
    if (published !== undefined)    data.published = Boolean(published);
    if (collection_id !== undefined) data.collection_id = Number(collection_id);
    const album = await prisma.album.update({ where: { id: Number(req.params.id) }, data });
    res.json(album);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/albums/:id — admin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.album.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Álbum removido' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
