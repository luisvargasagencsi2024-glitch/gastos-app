require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { connectDb, User, Transaction, Budget, Category } = require('./db');

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

app.post('/api/register', async (req, res) => {
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

  const existing = await User.findOne({ username });
  if (existing) {
    return res.status(409).json({ error: 'Ese usuario ya existe' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = await new User({ username, passwordHash }).save();
  req.session.userId = user._id.toString();
  res.json({ success: true, user: { id: user._id.toString(), username } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const user = await User.findOne({ username });
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  req.session.userId = user._id.toString();
  res.json({ success: true, user: { id: user._id.toString(), username: user.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const user = await User.findById(req.session.userId).select('username createdAt');
  if (!user) {
    req.session.destroy();
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, user: { id: user._id.toString(), username: user.username, created_at: user.createdAt } });
});

// Transactions

app.get('/api/transactions', requireAuth, async (req, res) => {
  const txs = await Transaction.find({ userId: req.session.userId }).sort({ date: -1 }).lean();
  res.json(txs.map(t => ({ ...t, id: t._id.toString(), userId: t.userId.toString() })));
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  const { amount, type, categoryId, date, description } = req.body;
  if (!amount || !type || !categoryId || !date) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const tx = await new Transaction({ userId: req.session.userId, amount, type, categoryId, date, description: description || '' }).save();
  res.json({ ...tx.toObject(), id: tx._id.toString(), userId: tx.userId.toString() });
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!tx) return res.status(404).json({ error: 'No encontrada' });

  const { amount, type, categoryId, date, description } = req.body;
  tx.amount = amount;
  tx.type = type;
  tx.categoryId = categoryId;
  tx.date = date;
  tx.description = description || '';
  await tx.save();
  res.json({ ...tx.toObject(), id: tx._id.toString(), userId: tx.userId.toString() });
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  const result = await Transaction.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
  if (!result) return res.status(404).json({ error: 'No encontrada' });
  res.json({ success: true });
});

// Budgets

app.get('/api/budgets', requireAuth, async (req, res) => {
  const budgets = await Budget.find({ userId: req.session.userId }).lean();
  const map = {};
  budgets.forEach(b => { map[b.categoryId] = b.amount; });
  res.json(map);
});

app.put('/api/budgets', requireAuth, async (req, res) => {
  const { categoryId, amount } = req.body;
  if (categoryId == null || amount == null) {
    return res.status(400).json({ error: 'Faltan campos' });
  }

  await Budget.findOneAndUpdate(
    { userId: req.session.userId, categoryId },
    { userId: req.session.userId, categoryId, amount },
    { upsert: true }
  );
  res.json({ success: true });
});

// Categories

app.get('/api/categories', requireAuth, async (req, res) => {
  const cats = await Category.find({
    $or: [{ isDefault: true }, { userId: req.session.userId }]
  }).sort({ id: 1 }).lean();
  res.json(cats.map(c => ({ id: c.id, name: c.name, type: c.type, icon: c.icon, isDefault: c.isDefault })));
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, type, icon } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Nombre y tipo requeridos' });
  }

  const maxCat = await Category.findOne({ userId: req.session.userId }).sort({ id: -1 }).lean();
  const maxDefault = await Category.findOne({ isDefault: true }).sort({ id: -1 }).lean();
  const nextId = Math.max(maxCat ? maxCat.id : 0, maxDefault ? maxDefault.id : 0) + 1;

  const cat = await new Category({ id: nextId, name, type, icon: icon || '📄', userId: req.session.userId }).save();
  res.json({ id: cat.id, name: cat.name, type: cat.type, icon: cat.icon, isDefault: false });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

connectDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
});
