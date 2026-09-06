const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Password Protection Middleware
const authMiddleware = basicAuth({
    users: { 'admin': 'your_secure_password' }, // Change these credentials as needed
    challenge: true,
    realm: 'InvoiceBankProtected'
});

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Cloud Database!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schema with all active fields
const invoiceSchema = new mongoose.Schema({
  client: String,
  amount: Number,
  date: String,
  fileName: String,
  year: String,
  createdAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch all saved invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Save a new invoice to MongoDB
app.post('/api/invoices', async (req, res) => {
  try {
    const { client, amount, date, fileName } = req.body;
    const year = date ? date.split('-')[0] : new Date().getFullYear().toString();

    const newInvoice = new Invoice({
      client,
      amount: parseFloat(amount) || 0,
      date,
      fileName,
      year
    });

    await newInvoice.save();
    res.status(201).json(newInvoice);
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});

// Protected File/Invoice Viewer Route
app.get('/files', authMiddleware, async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    const rows = invoices.map(inv => `
      <tr>
        <td>${inv.client || 'N/A'}</td>
        <td>$${inv.amount ? inv.amount.toFixed(2) : '0.00'}</td>
        <td>${inv.date || 'N/A'}</td>
        <td>${inv.fileName || 'N/A'}</td>
        <td>${new Date(inv.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');

    res.send(`
      <html>
        <head>
          <title>Invoice Bank - File Viewer</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f4f4f9; color: #333; }
            h2 { color: #222; }
            table { width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #007bff; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            a { display: inline-block; margin-top: 20px; text-decoration: none; color: #007bff; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>Uploaded Invoice Records</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Amount</th>
                <th>Date</th>
                <th>File Name</th>
                <th>Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" style="text-align:center;">No records found</td></tr>'}
            </tbody>
          </table>
          <a href="/">← Back to Dashboard</a>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Failed to load file records');
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
