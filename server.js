const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const csv = require('csv-parser');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let fsnSkuMap = {};

app.post('/upload-mapping', upload.single('file'), (req, res) => {
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      fsnSkuMap[row.FSN] = row.SKU;
    })
    .on('end', () => {
      fs.unlinkSync(req.file.path);
      res.json({ status: 'Mapping uploaded successfully' });
    });
});

app.post('/get-orders', async (req, res) => {
  const { accessToken } = req.body;

  try {
    const response = await axios.get('https://api.flipkart.net/sellers/v3/orders', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json(response.data.items || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/process-label', async (req, res) => {
  const { accessToken, orderId, fsn } = req.body;
  try {
    const labelRes = await axios.get(`https://api.flipkart.net/sellers/v3/orders/${orderId}/label`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
    });

    const pdfDoc = await PDFDocument.load(labelRes.data);
    const pages = pdfDoc.getPages();
    const sku = fsnSkuMap[fsn] || 'SKU_NOT_FOUND';

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const lastPage = pages[pages.length - 1];
    lastPage.drawText(`SKU: ${sku}`, {
      x: 50,
      y: 25,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    const modifiedPdf = await pdfDoc.save();
    res.setHeader('Content-Disposition', `attachment; filename=${orderId}_label.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(modifiedPdf);
  } catch (err) {
    res.status(500).json({ error: 'PDF processing failed' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
