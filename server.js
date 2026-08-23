const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Paste your MongoDB connection string here:
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://xxwilwinxx_db_user:sWt89pFX4hyN6Fe4@novus.sz5nwyg.mongodb.net/invoiceDB?retryWrites=true&w=majority';

// Connect to MongoDB Cloud
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Cloud Database!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define Invoice Schema
const invoiceSchema = new mongoose.Schema({
  year: String,
  filename: String,
  createdAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Get all invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Add a new invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { year, filename } = req.body;
    const newInvoice = new Invoice({ year, filename });
    await newInvoice.save();
    res.status(201).json(newInvoice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
