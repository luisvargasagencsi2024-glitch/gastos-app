const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  categoryId: { type: Number, required: true },
  date: { type: String, required: true },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  categoryId: { type: Number, required: true },
  amount: { type: Number, default: 0 },
});

budgetSchema.index({ userId: 1, categoryId: 1 }, { unique: true });

const categorySchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  icon: { type: String, default: '📄' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

categorySchema.index({ id: 1, userId: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Budget = mongoose.model('Budget', budgetSchema);
const Category = mongoose.model('Category', categorySchema);

const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Salario',     type: 'income',  icon: '💰', isDefault: true },
  { id: 2, name: 'Comida',      type: 'expense', icon: '🍕', isDefault: true },
  { id: 3, name: 'Transporte',  type: 'expense', icon: '🚗', isDefault: true },
  { id: 4, name: 'Vivienda',    type: 'expense', icon: '🏠', isDefault: true },
  { id: 5, name: 'Servicios',   type: 'expense', icon: '💡', isDefault: true },
  { id: 6, name: 'Salud',       type: 'expense', icon: '💊', isDefault: true },
  { id: 7, name: 'Ocio',        type: 'expense', icon: '🎬', isDefault: true },
  { id: 8, name: 'Educación',   type: 'expense', icon: '📚', isDefault: true },
];

async function seedDefaultCategories() {
  const count = await Category.countDocuments({ isDefault: true });
  if (count === 0) {
    await Category.insertMany(DEFAULT_CATEGORIES);
    console.log('Categorías por defecto creadas');
  }
}

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI no está definida');
  await mongoose.connect(uri);
  console.log('Conectado a MongoDB');
  await seedDefaultCategories();
}

module.exports = { connectDb, User, Transaction, Budget, Category };
