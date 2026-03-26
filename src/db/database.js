const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
});

// Wrapper compatível com a API @libsql/client usada nos routes:
// db.execute('SELECT ...') ou db.execute({ sql: '...', args: [...] })
// Converte ? → $1, $2, ... automaticamente e devolve { rows, lastInsertRowid }
const db = {
  execute: async (sqlOrObj) => {
    let sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
    const args = typeof sqlOrObj === 'string' ? [] : (sqlOrObj.args || []);

    // Substituir ? por $1, $2, ...
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++i}`);

    const result = await pool.query(pgSql, args);
    return {
      rows: result.rows,
      lastInsertRowid: result.rows[0]?.id ?? null,
    };
  },
};

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      email     TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      name      TEXT NOT NULL,
      role      TEXT DEFAULT 'admin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT UNIQUE NOT NULL,
      description TEXT,
      cover_image TEXT,
      "order"     INTEGER DEFAULT 0,
      published   BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS albums (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      slug          TEXT NOT NULL,
      description   TEXT,
      cover_image   TEXT,
      "order"       INTEGER DEFAULT 0,
      published     BOOLEAN DEFAULT TRUE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(collection_id, slug)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id         SERIAL PRIMARY KEY,
      filename   TEXT NOT NULL,
      url        TEXT NOT NULL,
      title      TEXT,
      "order"    INTEGER DEFAULT 0,
      media_type TEXT DEFAULT 'image',
      album_id   INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS image_metadata (
      id              SERIAL PRIMARY KEY,
      image_id        INTEGER UNIQUE NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      collection_name TEXT,
      tipo_acervo     TEXT,
      numero_registro TEXT,
      fundo           TEXT,
      funcao          TEXT,
      data_producao   TEXT,
      local           TEXT,
      genero          TEXT,
      tipo_documental TEXT,
      suporte         TEXT,
      dimensoes       TEXT,
      autor_producao  TEXT,
      conteudo        TEXT,
      tags            TEXT,
      extra_fields    TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Seed: cria admin padrão se não existir
  const bcrypt = require('bcryptjs');
  const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)`,
      ['admin@acervo.com', hash, 'Administrador', 'admin']
    );
    console.log('✓ Admin criado: admin@acervo.com / admin123');
  }
}

module.exports = { db, initDB };
