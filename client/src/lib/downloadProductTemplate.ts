import * as XLSX from 'xlsx';

export function downloadProductTemplate() {
  const wb = XLSX.utils.book_new();

  // ── Products sheet ───────────────────────────────────────────────────────

  const headers = [
    'sku', 'name', 'cost_price', 'selling_price', 'min_selling_price',
    'currency', 'category_name', 'weight_grams', 'reorder_level',
    'reorder_quantity', 'description',
  ];

  const required = [
    'REQUIRED', 'REQUIRED', 'REQUIRED', 'REQUIRED', 'optional',
    'REQUIRED', 'optional', 'optional', 'optional', 'optional', 'optional',
  ];

  const hints = [
    'Unique code, e.g. ORL-001',
    'Full product name',
    'Purchase / landed cost (number only)',
    'Customer price (number only)',
    'POS discount floor — leave blank to skip',
    'NGN / USD / GBP / EUR / AED / GHS',
    'Must match an existing category name exactly',
    'Weight in grams (whole number)',
    'Alert threshold — trigger reorder at this qty',
    'How many units to reorder (whole number)',
    'Optional product description',
  ];

  const sample = [
    'ORL-TRIO-001',
    'Orika Refined Luxury Trio Gift Set',
    15000,
    25000,
    20000,
    'NGN',
    'Gift Sets',
    250,
    5,
    10,
    'Premium gift set featuring three signature Orika scents.',
  ];

  const wsData = [headers, required, hints, sample];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 40 },
  ];

  // Freeze top 3 rows + column A
  ws['!freeze'] = { xSplit: 1, ySplit: 3, topLeftCell: 'B4', activePane: 'bottomRight' };

  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  // ── Instructions sheet ───────────────────────────────────────────────────

  const instructions = [
    ['Product Import Template — Instructions'],
    [''],
    ['HOW TO USE'],
    ['Fill in your products starting from row 5 of the Products sheet.'],
    ['Row 4 is a sample row — delete it or keep it as a reference.'],
    ['Rows 1–3 are locked headers — do not rearrange or delete columns.'],
    [''],
    ['REQUIRED FIELDS'],
    ['sku            — Must be unique across the catalogue.'],
    ['name           — The product display name.'],
    ['cost_price     — Number only, no currency symbols.'],
    ['selling_price  — Must be ≥ cost_price.'],
    ['currency       — 3-letter ISO code: NGN, USD, GBP, EUR, AED, GHS.'],
    [''],
    ['OPTIONAL FIELDS'],
    ['min_selling_price  — POS discount floor. Blank defaults to selling_price.'],
    ['category_name      — Must exactly match an existing category name.'],
    ['weight_grams       — Whole number in grams.'],
    ['reorder_level      — Alert fires when stock drops to this number.'],
    ['reorder_quantity   — Units to reorder when alert fires.'],
    ['description        — Free text.'],
    [''],
    ['IMPORT NOTES'],
    ['Save as .xlsx before uploading.'],
    ['Do not add extra sheets or rename the Products sheet.'],
    ['Duplicate SKUs in the same file will be rejected.'],
    ['SKUs that already exist in the catalogue will be skipped (not overwritten).'],
    ['A CODE128 barcode is auto-generated for each successfully imported product.'],
  ];

  const wsI = XLSX.utils.aoa_to_sheet(instructions);
  wsI['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');

  // ── Download ─────────────────────────────────────────────────────────────

  XLSX.writeFile(wb, 'orika_product_import_template.xlsx');
}
