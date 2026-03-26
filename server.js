const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./src/db/database');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/collections', require('./src/routes/collections'));
app.use('/api/albums', require('./src/routes/albums'));
app.use('/api/images', require('./src/routes/images'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/upload', require('./src/routes/upload'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', name: 'Acervo Maria da Conceição API' }));

// Start
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🏛️  Acervo Maria da Conceição`);
    console.log(`✓  Server running at http://localhost:${PORT}`);
    console.log(`✓  API docs: http://localhost:${PORT}/api/health\n`);
  });
}).catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});
