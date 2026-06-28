// InvoicePDF.js — generates and downloads a PDF invoice
// Uses the browser's print-to-PDF capability via a hidden iframe

import { CONFIG } from '../config';

export function downloadInvoicePDF(invoice, settings = {}) {
  const company  = settings.CompanyName || 'JB Brush Control';
  const address  = [settings.Address, settings.City, settings.State, settings.Zip].filter(Boolean).join(', ');
  const phone    = settings.Phone || '';
  const email    = settings.Email || '';

  let lineItemsHTML = '';
  try {
    const items = JSON.parse(invoice.LineItems || '[]');
    lineItemsHTML = items.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${item.description || ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${parseFloat(item.amount||0).toFixed(2)}</td>
      </tr>
    `).join('');
  } catch(e) { lineItemsHTML = `<tr><td colspan="2">${invoice.LineItems || ''}</td></tr>`; }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${invoice.InvoiceID}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size:13px; color:#111; background:white; padding:40px; max-width:720px; margin:0 auto; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #1a4a1a; }
    .company-name { font-size:24px; font-weight:bold; color:#1a4a1a; }
    .company-info { font-size:12px; color:#555; margin-top:4px; line-height:1.6; }
    .invoice-title { text-align:right; }
    .invoice-title h1 { font-size:28px; color:#1a4a1a; font-weight:bold; }
    .invoice-title .inv-id { font-size:16px; color:#555; margin-top:4px; }
    .billing { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }
    .billing-box h4 { font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280; margin-bottom:6px; }
    .billing-box p  { font-size:13px; line-height:1.6; }
    .meta { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; background:#f9fafb; padding:14px 18px; border-radius:8px; margin-bottom:24px; }
    .meta-item label { display:block; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; margin-bottom:3px; }
    .meta-item span  { font-size:14px; font-weight:600; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; }
    thead th { background:#1a4a1a; color:white; padding:10px 12px; text-align:left; font-size:12px; }
    thead th:last-child { text-align:right; }
    .totals { margin-left:auto; width:260px; }
    .totals-row { display:flex; justify-content:space-between; padding:5px 0; font-size:13px; border-bottom:1px solid #f3f4f6; }
    .totals-final { display:flex; justify-content:space-between; padding:10px 0 5px; font-size:16px; font-weight:bold; color:#1a4a1a; border-top:2px solid #1a4a1a; margin-top:6px; }
    .footer { margin-top:36px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center; font-size:11px; color:#9ca3af; }
    .status-badge { display:inline-block; padding:4px 12px; border-radius:99px; font-size:11px; font-weight:bold;
      background:${invoice.Status==='Paid'?'#dcfce7':'#fef3c7'}; color:${invoice.Status==='Paid'?'#166534':'#92400e'}; }
    @media print {
      body { padding:20px; }
      @page { margin:0.5in; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${company}</div>
      <div class="company-info">
        ${address ? address + '<br/>' : ''}
        ${phone ? 'Phone: ' + phone + '<br/>' : ''}
        ${email ? email : ''}
      </div>
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="inv-id">${invoice.InvoiceID}</div>
      <div style="margin-top:8px;"><span class="status-badge">${invoice.Status}</span></div>
    </div>
  </div>

  <div class="billing">
    <div class="billing-box">
      <h4>Bill To</h4>
      <p>
        <strong>${invoice.CustomerName || ''}</strong><br/>
        ${invoice.CustomerAddress ? invoice.CustomerAddress + '<br/>' : ''}
        ${invoice.CustomerPhone ? invoice.CustomerPhone + '<br/>' : ''}
        ${invoice.CustomerEmail || ''}
      </p>
    </div>
    <div class="billing-box">
      <h4>Job Details</h4>
      <p>
        ${invoice.JobDescription ? invoice.JobDescription + '<br/>' : ''}
        ${invoice.Division ? '<strong>' + invoice.Division + ' Division</strong>' : ''}
      </p>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><label>Issue Date</label><span>${invoice.IssueDate || ''}</span></div>
    <div class="meta-item"><label>Due Date</label><span>${invoice.DueDate || 'Upon receipt'}</span></div>
    <div class="meta-item"><label>Invoice #</label><span>${invoice.InvoiceID}</span></div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
    </thead>
    <tbody>${lineItemsHTML}</tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>$${parseFloat(invoice.Subtotal||0).toFixed(2)}</span></div>
    <div class="totals-row"><span>Tax (${(parseFloat(invoice.TaxRate||0)*100).toFixed(0)}%)</span><span>$${parseFloat(invoice.TaxAmount||0).toFixed(2)}</span></div>
    <div class="totals-final"><span>Total Due</span><span>$${parseFloat(invoice.Total||0).toFixed(2)}</span></div>
    ${invoice.Status==='Paid' ? `<div style="margin-top:8px;text-align:center;color:#166534;font-weight:bold;">✅ PAID ${invoice.PaidDate ? 'on ' + invoice.PaidDate : ''} ${invoice.PaymentMethod ? '· ' + invoice.PaymentMethod : ''}</div>` : ''}
  </div>

  <div class="footer">
    Thank you for your business! · ${company}${phone ? ' · ' + phone : ''}
  </div>
</body>
</html>`;

  // Open in new window and trigger print-to-PDF
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    // Popup blocked — fallback: download as HTML
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Invoice_${invoice.InvoiceID}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.print();
      // After print dialog, close the window
      win.onafterprint = () => win.close();
    }, 300);
  };
}
