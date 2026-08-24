const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = process.env.PORT || 3000;

// Paste your MongoDB connection string here:
const MONGO_URI = process.env.MONGO_URI;

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
// OCR Extraction Route
app.post('/api/extract-invoice', upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('apikey', process.env.OCR_API_KEY);
    formData.append('base64Image', `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`);

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const ocrData = await ocrResponse.json();
    const rawText = ocrData.ParsedResults?.[0]?.ParsedText || '';

    const amountMatch = rawText.match(/\$?(\d+\.\d{2})/);
    const dateMatch = rawText.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);

    res.json({
      amount: amountMatch ? amountMatch[1] : '',
      date: dateMatch ? dateMatch[1] : '',
      rawText: rawText
    });
  } catch (err) {
    console.error('OCR Extraction Error:', err);
    res.status(500).json({ error: 'Failed to read invoice file' });
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
