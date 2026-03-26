const router = require('express').Router();
const { prisma } = require('../db/database');
const { authMiddleware: auth } = require('../middleware/auth');

const DEFAULT_FIELDS = [
  { key: 'tipo_acervo',    label: 'Tema / Categoria',           visible: true  },
  { key: 'genero',         label: 'Subtema',                    visible: true  },
  { key: 'data_producao',  label: 'Data',                       visible: true  },
  { key: 'suporte',        label: 'Suporte',                    visible: true  },
  { key: 'autor_producao', label: 'Origem / Crédito',           visible: true  },
  { key: 'conteudo',       label: 'Descrição (acessibilidade)', visible: true  },
  { key: 'collection_name',  label: 'Coleção',        visible: false },
  { key: 'numero_registro',  label: 'Nº de Registro', visible: false },
  { key: 'fundo',            label: 'Fundo',          visible: false },
  { key: 'funcao',           label: 'Função',         visible: false },
  { key: 'local',            label: 'Local',          visible: false },
  { key: 'tipo_documental',  label: 'Tipo Documental', visible: false },
  { key: 'dimensoes',        label: 'Dimensões',      visible: false },
];

// GET /api/settings/:key — public
router.get('/:key', async (req, res) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: req.params.key } });
    if (!setting) {
      if (req.params.key === 'metadata_fields') return res.json({ value: DEFAULT_FIELDS });
      return res.json({ value: null });
    }
    res.json({ value: JSON.parse(setting.value) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings/:key — admin
router.put('/:key', auth, async (req, res) => {
  try {
    const value = JSON.stringify(req.body.value);
    await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value },
      create: { key: req.params.key, value },
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
