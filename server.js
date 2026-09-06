const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Global Password Protection for the Entire Site
const authMiddleware = basicAuth({
    users: { 'admin': 'your_secure_password' },
    challenge: true,
    realm: 'InvoiceBankProtected'
});

app.use(authMiddleware);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Cloud Database!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schema to store binary file data and content type
const invoiceSchema = new mongoose.Schema({
  client: String,
  amount: Number,
  date: String,
  fileName: String,
  fileData: Buffer,
  fileContentType: String,
  year: String,
  createdAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Fetch all saved invoices (excluding heavy binary data for the dashboard)
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find().select('-fileData').sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Save a new invoice with file data to MongoDB
app.post('/api/invoices', upload.single('invoiceFile'), async (req, res) => {
  try {
    const { client, amount, date, fileName } = req.body;
    const year = date ? date.split('-')[0] : new Date().getFullYear().toString();

    const newInvoiceData = {
      client,
      amount: parseFloat(amount) || 0,
      date,
      fileName: req.file ? req.file.originalname : (fileName || 'Unknown'),
      year
    };

    if (req.file) {
      newInvoiceData.fileData = req.file.buffer;
      newInvoiceData.fileContentType = req.file.mimetype;
    }

    const newInvoice = new Invoice(newInvoiceData);
    await newInvoice.save();
    res.status(201).json(newInvoice);
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});

// Route to click and view the specific uploaded file
app.get('/api/invoices/:id/file', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice || !invoice.fileData) {
      return res.status(404).send('File not found');
    }

    res.setHeader('Content-Type', invoice.fileContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName || 'invoice'}"`);
    res.send(invoice.fileData);
  } catch (err) {
    res.status(500).send('Error retrieving file');
  }
});

// File/Invoice Viewer HTML Route with clickable view links
app.get('/files', async (req, res) => {
  try {
    const invoices = await Invoice.find().select('-fileData').sort({ createdAt: -1 });
    const rows = invoices.map(inv => `
      <tr>
        <td>${inv.client || 'N/A'}</td>
        <td>$${inv.amount ? inv.amount.toFixed(2) : '0.00'}</td>
        <td>${inv.date || 'N/A'}</td>
        <td>${inv.fileName || 'N/A'}</td>
        <td>${new Date(inv.createdAt).toLocaleDateString()}</td>
        <td><a href="/api/invoices/${inv._id}/file" target="_blank">View File</a></td>
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
            a.back { display: inline-block; margin-top: 20px; text-decoration: none; color: #007bff; font-weight: bold; }
            a { color: #007bff; text-decoration: none; font-weight: bold; }
            a:hover { text-decoration: underline; }
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6" style="text-align:center;">No records found</td></tr>'}
            </tbody>
          </table>
          <a class="back" href="/">← Back to Dashboard</a>
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
