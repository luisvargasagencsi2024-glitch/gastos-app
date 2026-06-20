const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(session({
  secret: process.env.SESSION_SECRET || 'gastos-app-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

// Auth

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 30 caracteres' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Ese usuario ya existe' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, password_hash);
  req.session.userId = result.lastInsertRowid;
  res.json({ success: true, user: { id: result.lastInsertRowid, username } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, username: user.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const db = getDb();
  const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, user });
});

// Transactions

app.get('/api/transactions', requireAuth, (req, res) => {
  const db = getDb();
  const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC').all(req.session.userId);
  res.json(txs);
});

app.post('/api/transactions', requireAuth, (req, res) => {
  const { amount, type, categoryId, date, description } = req.body;
  if (!amount || !type || !categoryId || !date) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO transactions (user_id, amount, type, category_id, date, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.session.userId, amount, type, categoryId, date, description || '');

  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.json(tx);
});

app.put('/api/transactions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!tx) return res.status(404).json({ error: 'No encontrada' });

  const { amount, type, categoryId, date, description } = req.body;
  db.prepare(
    'UPDATE transactions SET amount = ?, type = ?, category_id = ?, date = ?, description = ? WHERE id = ? AND user_id = ?'
  ).run(amount, type, categoryId, date, description || '', req.params.id, req.session.userId);

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/transactions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  res.json({ success: true });
});

// Budgets

app.get('/api/budgets', requireAuth, (req, res) => {
  const db = getDb();
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(req.session.userId);
  const map = {};
  budgets.forEach(b => { map[b.category_id] = b.amount; });
  res.json(map);
});

app.put('/api/budgets', requireAuth, (req, res) => {
  const { categoryId, amount } = req.body;
  if (categoryId == null || amount == null) {
    return res.status(400).json({ error: 'Faltan campos' });
  }

  const db = getDb();
  db.prepare(
    'INSERT INTO budgets (user_id, category_id, amount) VALUES (?, ?, ?) ON CONFLICT(user_id, category_id) DO UPDATE SET amount = ?'
  ).run(req.session.userId, categoryId, amount, amount);

  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
