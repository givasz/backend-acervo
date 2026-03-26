const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authMiddleware: auth } = require('../middleware/auth');

const DEFAULT_FIELDS = [
  { key: 'tipo_acervo',    label: 'Tema / Categoria',          visible: true  },
  { key: 'genero',         label: 'Subtema',                   visible: true  },
  { key: 'data_producao',  label: 'Data',                      visible: true  },
  { key: 'suporte',        label: 'Suporte',                   visible: true  },
  { key: 'autor_producao', label: 'Origem / Crédito',          visible: true  },
  { key: 'conteudo',       label: 'Descrição (acessibilidade)', visible: true  },
  // Campos arquivísticos extras — ocultos por padrão, ativáveis nas configurações
  { key: 'collection_name',  label: 'Coleção',          visible: false },
  { key: 'numero_registro',  label: 'Nº de Registro',   visible: false },
  { key: 'fundo',            label: 'Fundo',             visible: false },
  { key: 'funcao',           label: 'Função',            visible: false },
  { key: 'local',            label: 'Local',             visible: false },
  { key: 'tipo_documental',  label: 'Tipo Documental',   visible: false },
  { key: 'dimensoes',        label: 'Dimensões',         visible: false },
];

// GET /api/settings/:key — public
router.get('/:key', async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [req.params.key] });
    if (r.rows.length === 0) {
      if (req.params.key === 'metadata_fields') return res.json({ value: DEFAULT_FIELDS });
      return res.json({ value: null });
    }
    res.json({ value: JSON.parse(r.rows[0].value) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:key — admin only
router.put('/:key', auth, async (req, res) => {
  try {
    const value = JSON.stringify(req.body.value);
    await db.execute({
      sql: `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [req.params.key, value],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
