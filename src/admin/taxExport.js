// Builds the year-end "Business Expenses" workbook in the same layout the
// bookkeeper already uses (one tab per category, Date / Merchant / Amount /
// Description, a total at the bottom), plus a Summary, Income and Mileage tab.
//
// ExcelJS is large, so it's only loaded when someone clicks Export.

import { irsMileageRate, toInputDate } from '../api';

// App category → her tab. Columns mirror her workbook.
const TABS = [
  { name: 'Fuel Expense',      cats: ['Fuel'],
    cols: [['Date', 11.3], ['Amount', 12], ['Notes', 63]] },
  { name: 'Parts and Repairs', cats: ['Parts and Repairs'],
    cols: [['Date', 13.3], ['Merchant', 28.6], ['Amount', 13.9], ['Equipment', 17.9], ['Description', 70]] },
  { name: 'Supplies',          cats: ['Supplies', 'Chemical'],
    cols: [['Date', 12.6], ['Merchant', 22.9], ['Amount', 15], ['Description', 79.7]] },
  { name: 'Assets',            cats: ['Assets'],
    cols: [['Date', 10.7], ['Merchant', 20.7], ['Amount', 12], ['Description', 70.7]] },
  { name: 'Taxes and fees',    cats: ['Taxes and Licenses'],
    cols: [['Date', 12.3], ['Vendor', 35.6], ['Amount', 13.7], ['Notes', 74.4]] },
  { name: 'Insurance Exp',     cats: ['Insurance'],
    cols: [['Date', 13.9], ['Vendor', 34.7], ['Amount', 14], ['Notes', 63.7]] },
  { name: 'Utilities',         cats: ['Utilities'],
    cols: [['Date', 11.9], ['Merchant', 30.6], ['Amount', 15.3], ['Description', 77.3]] },
  { name: 'Communications',    cats: ['Communications'],
    cols: [['Date', 11.9], ['Merchant', 30.6], ['Amount', 15.3], ['Description', 77.3]] },
  { name: 'Legal and Prof',    cats: ['Legal and Professional'],
    cols: [['Date', 12], ['Vendor', 30], ['Amount', 14], ['Notes', 70]] },
  { name: 'Office Expense',    cats: ['Office Expense'],
    cols: [['Date', 12], ['Merchant', 30], ['Amount', 14], ['Description', 70]] },
  { name: 'Other',             cats: [],   // anything not listed above
    cols: [['Date', 12], ['Merchant', 30], ['Amount', 14], ['Category', 18], ['Description', 70]] },
];

// Same names as her "Business deduction catagories" tab
const SUMMARY_LABEL = {
  'Fuel Expense': 'Fuel', 'Parts and Repairs': 'Repairs and Maintenance', 'Supplies': 'Supplies',
  'Assets': 'Assets', 'Taxes and fees': 'Taxes and licenses', 'Insurance Exp': 'Business insurance',
  'Utilities': 'Utilities', 'Communications': 'Communications', 'Legal and Prof': 'Legal and Prof. expense',
  'Office Expense': 'Office expense', 'Other': 'Other',
};

const MONEY = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)';
const DATE  = 'm/d/yy';
const GREEN = 'FF1A4A1A';

function toDate(v) {
  const d = toInputDate(v);
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));   // Excel dates have no time zone
}

function valueFor(col, e, tabCols) {
  switch (col) {
    case 'Date':        return toDate(e.Date);
    case 'Amount':      return parseFloat(e.Amount) || 0;
    case 'Merchant':
    case 'Vendor':      return e.Vendor || '';
    case 'Equipment':   return e.Equipment || '';
    case 'Category':    return e.Category || '';
    default: {          // Notes / Description
      const parts = [];
      // Tabs without a Merchant column (Fuel): put the merchant in the notes
      if (e.Vendor && !tabCols.some(([c]) => c === 'Merchant' || c === 'Vendor')) parts.push(e.Vendor);
      if (e.Category === 'Chemical') parts.push('Chemical');
      if (e.Description) parts.push(e.Description);
      if (e.Notes && e.Notes !== e.Description) parts.push(e.Notes);
      if (e.JobLabel) parts.push('Job: ' + e.JobLabel);
      return parts.join(' — ');
    }
  }
}

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true, size: 13, name: 'Calibri' };
  row.border = { bottom: { style: 'thin' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * data: { expenses, invoices, mileage, jobs }   (as returned by the API)
 * Returns an ExcelJS workbook.
 */
export async function buildTaxWorkbook(ExcelJS, data, year, company = 'JB Brush Control') {
  const inYear = d => (toInputDate(d) || '').slice(0, 4) === String(year);
  const jobLabel = {};
  (data.jobs || []).forEach(j => { jobLabel[j.JobID] = [j.CustomerName, j.Description].filter(Boolean).join(' – ').slice(0, 60); });

  const expenses = (data.expenses || [])
    .filter(e => inYear(e.Date))
    .map(e => ({ ...e, JobLabel: e.JobID ? jobLabel[e.JobID] || '' : '' }))
    .sort((a, b) => (toInputDate(a.Date) || '').localeCompare(toInputDate(b.Date) || ''));

  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  wb.created = new Date();

  const summary = wb.addWorksheet('Summary');   // filled in at the end, but first tab
  const totalCell = {};                          // tab name → cell holding its total
  const known = new Set(TABS.flatMap(t => t.cats));

  for (const tab of TABS) {
    const rows = expenses.filter(e => tab.cats.length ? tab.cats.includes(e.Category) : !known.has(e.Category));
    const ws = wb.addWorksheet(tab.name);
    ws.columns = tab.cols.map(([header, width]) => ({ header, width }));
    styleHeader(ws);
    const amountCol = tab.cols.findIndex(c => c[0] === 'Amount') + 1;
    const dateCol   = tab.cols.findIndex(c => c[0] === 'Date') + 1;

    rows.forEach(e => ws.addRow(tab.cols.map(([c]) => valueFor(c, e, tab.cols))));

    // Total row (a real SUM, like her sheets), with a blank row before it
    const first = 2, last = Math.max(2, rows.length + 1);
    const totalRowNum = rows.length + 3;
    const totalRow = ws.getRow(totalRowNum);
    const labelCol = amountCol > 1 ? amountCol - 1 : amountCol + 1;
    totalRow.getCell(labelCol).value = 'Total';
    totalRow.getCell(amountCol).value = { formula: rows.length ? `SUM(${colLetter(amountCol)}${first}:${colLetter(amountCol)}${last})` : '0', result: rows.reduce((s, e) => s + (parseFloat(e.Amount) || 0), 0) };
    totalRow.font = { bold: true };
    totalRow.getCell(amountCol).border = { top: { style: 'thin' }, bottom: { style: 'double' } };

    ws.getColumn(amountCol).numFmt = MONEY;
    if (dateCol) ws.getColumn(dateCol).numFmt = DATE;
    ws.getColumn(dateCol).alignment = { horizontal: 'left' };
    totalCell[tab.name] = `'${tab.name}'!${colLetter(amountCol)}${totalRowNum}`;
  }

  // ── Income: invoices paid during the year ──────────────────
  const paid = (data.invoices || [])
    .filter(i => i.Status === 'Paid' && inYear(i.PaidDate))
    .sort((a, b) => (toInputDate(a.PaidDate) || '').localeCompare(toInputDate(b.PaidDate) || ''));
  const inc = wb.addWorksheet('Income');
  inc.columns = [['Date Paid', 12], ['Invoice #', 12], ['Customer', 30], ['Division', 10], ['Amount', 14], ['Payment', 14], ['Job', 60]]
    .map(([header, width]) => ({ header, width }));
  styleHeader(inc);
  paid.forEach(i => inc.addRow([toDate(i.PaidDate), i.InvoiceID, i.CustomerName || '', i.Division || '', parseFloat(i.Total) || 0, i.PaymentMethod || '', i.JobDescription || '']));
  const incTotalRow = paid.length + 3;
  inc.getRow(incTotalRow).getCell(4).value = 'Total';
  inc.getRow(incTotalRow).getCell(5).value = { formula: paid.length ? `SUM(E2:E${paid.length + 1})` : '0', result: paid.reduce((s, i) => s + (parseFloat(i.Total) || 0), 0) };
  inc.getRow(incTotalRow).font = { bold: true };
  inc.getColumn(1).numFmt = DATE; inc.getColumn(5).numFmt = MONEY;

  // ── Mileage, with the IRS rate for each trip's date ────────
  const trips = (data.mileage || [])
    .filter(m => inYear(m.Date))
    .sort((a, b) => (toInputDate(a.Date) || '').localeCompare(toInputDate(b.Date) || ''));
  const mil = wb.addWorksheet('Mileage');
  mil.columns = [['Date', 11], ['Driver', 16], ['Truck', 20], ['Division', 10], ['From', 34], ['To', 34], ['Miles', 9], ['IRS rate', 9], ['Deduction', 13], ['Notes', 40]]
    .map(([header, width]) => ({ header, width }));
  styleHeader(mil);
  trips.forEach((m, i) => {
    const r = i + 2;
    mil.addRow([toDate(m.Date), m.DriverName || '', m.TruckName || '', m.Division || '', m.PointA || '', m.PointB || '',
      parseFloat(m.TotalMiles) || 0, irsMileageRate(m.Date),
      { formula: `G${r}*H${r}`, result: (parseFloat(m.TotalMiles) || 0) * irsMileageRate(m.Date) }, m.Purpose || '']);
  });
  const milTotalRow = trips.length + 3;
  mil.getRow(milTotalRow).getCell(6).value = 'Total';
  mil.getRow(milTotalRow).getCell(7).value = { formula: trips.length ? `SUM(G2:G${trips.length + 1})` : '0' };
  mil.getRow(milTotalRow).getCell(9).value = { formula: trips.length ? `SUM(I2:I${trips.length + 1})` : '0' };
  mil.getRow(milTotalRow).font = { bold: true };
  mil.getColumn(1).numFmt = DATE; mil.getColumn(8).numFmt = '$0.000'; mil.getColumn(9).numFmt = MONEY;

  // ── Summary (first tab): totals by deduction category ──────
  summary.columns = [{ width: 34 }, { width: 16 }, { width: 50 }];
  summary.getCell('A1').value = `${company} — ${year} business summary`;
  summary.getCell('A1').font = { bold: true, size: 15, color: { argb: GREEN } };
  summary.getCell('A2').value = `Exported from the JB Brush Control app on ${new Date().toLocaleDateString('en-US')}`;
  summary.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };

  let r = 4;
  const head = (text) => { summary.getCell(`A${r}`).value = text; summary.getRow(r).font = { bold: true, size: 13 }; summary.getRow(r).border = { bottom: { style: 'thin' } }; r++; };
  head('Income');
  summary.getCell(`A${r}`).value = 'Paid invoices';
  summary.getCell(`B${r}`).value = { formula: `Income!E${incTotalRow}` };
  summary.getCell(`C${r}`).value = 'See the Income tab';
  const incomeRow = r; r += 2;

  head('Expenses (by deduction category)');
  const firstExp = r;
  for (const tab of TABS) {
    summary.getCell(`A${r}`).value = SUMMARY_LABEL[tab.name] || tab.name;
    summary.getCell(`B${r}`).value = { formula: totalCell[tab.name] };
    summary.getCell(`C${r}`).value = `See the "${tab.name}" tab`;
    r++;
  }
  summary.getCell(`A${r}`).value = 'Total expenses';
  summary.getCell(`B${r}`).value = { formula: `SUM(B${firstExp}:B${r - 1})` };
  summary.getRow(r).font = { bold: true };
  summary.getCell(`B${r}`).border = { top: { style: 'thin' } };
  const expTotalRow = r; r += 2;

  head('Mileage');
  summary.getCell(`A${r}`).value = 'Business miles';
  summary.getCell(`B${r}`).value = { formula: `Mileage!G${milTotalRow}` };
  const milesRow = r;
  r++;
  summary.getCell(`A${r}`).value = 'Standard mileage deduction';
  summary.getCell(`B${r}`).value = { formula: `Mileage!I${milTotalRow}` };
  summary.getCell(`C${r}`).value = 'IRS rate for each trip date (2026: 72.5¢ Jan–Jun, 76¢ Jul–Dec)';
  r++;
  summary.getCell(`C${r}`).value = 'Note: the mileage rate usually can\'t be combined with actual fuel/repair costs for the same vehicle — ask your tax preparer which to use.';
  summary.getCell(`C${r}`).font = { italic: true, color: { argb: 'FF6B7280' } };
  summary.getCell(`C${r}`).alignment = { wrapText: true };
  r += 2;

  head('Bottom line');
  summary.getCell(`A${r}`).value = 'Income minus expenses';
  summary.getCell(`B${r}`).value = { formula: `B${incomeRow}-B${expTotalRow}` };
  summary.getCell(`C${r}`).value = 'Before the mileage deduction; check with your tax preparer';
  summary.getRow(r).font = { bold: true };

  summary.getColumn(2).numFmt = MONEY;
  summary.getCell(`B${milesRow}`).numFmt = '#,##0.0';   // miles, not dollars

  return wb;
}

function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// Browser: build the workbook and download it
export async function downloadTaxWorkbook(data, year, company) {
  const ExcelJS = (await import('exceljs')).default;
  const wb  = await buildTaxWorkbook(ExcelJS, data, year, company);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${company.replace(/[^A-Za-z0-9 ]/g, '')} Business Expenses ${year}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
