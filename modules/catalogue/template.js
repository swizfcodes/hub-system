"use strict";

/**
 * Generates the product import XLSX template in-memory using ExcelJS.
 * Returns a Buffer ready to stream as a file download.
 */
const ExcelJS = require("exceljs");

const COLUMNS = [
  {
    key: "sku",
    header: "sku",
    required: true,
    width: 20,
    hint: "Unique code, e.g. ORL-001",
  },
  {
    key: "name",
    header: "name",
    required: true,
    width: 32,
    hint: "Full product name",
  },
  {
    key: "cost_price",
    header: "cost_price",
    required: true,
    width: 14,
    hint: "Purchase / landed cost (number)",
  },
  {
    key: "selling_price",
    header: "selling_price",
    required: true,
    width: 16,
    hint: "Customer price (number)",
  },
  {
    key: "min_selling_price",
    header: "min_selling_price",
    required: false,
    width: 20,
    hint: "POS discount floor — leave blank to skip",
  },
  {
    key: "currency",
    header: "currency",
    required: true,
    width: 11,
    hint: "NGN / USD / GBP / EUR / AED / GHS",
  },
  {
    key: "category_name",
    header: "category_name",
    required: false,
    width: 22,
    hint: "Must match an existing category exactly",
  },
  {
    key: "weight_grams",
    header: "weight_grams",
    required: false,
    width: 14,
    hint: "Weight in grams (whole number)",
  },
  {
    key: "reorder_level",
    header: "reorder_level",
    required: false,
    width: 14,
    hint: "Alert when stock drops to this",
  },
  {
    key: "reorder_quantity",
    header: "reorder_quantity",
    required: false,
    width: 16,
    hint: "Units to reorder (whole number)",
  },
  {
    key: "description",
    header: "description",
    required: false,
    width: 42,
    hint: "Optional product description",
  },
];

const NAVY = "1A1A2E";
const NAVY2 = "22223A";
const GOLD = "C8A96E";
const RED = "D94040";
const GREY = "888888";
const WHITE = "FFFFFF";
const SAMPLE = "F7F5EE";
const BORDER_GREY = "CCCCCC";
const BORDER_GOLD = "C8A96E";

function thinBorder(color = BORDER_GREY) {
  return { style: "thin", color: { argb: `FF${color}` } };
}

function cellBorder(bottomColor = BORDER_GREY) {
  return {
    top: thinBorder(),
    left: thinBorder(),
    bottom: thinBorder(bottomColor),
    right: thinBorder(),
  };
}

async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  const { getPlatformBrand } = require("../../lib/branding");
  wb.creator = (await getPlatformBrand()).product_name;
  wb.created = new Date();

  // ── Products sheet ─────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Products", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3 }],
  });

  // Row 1 — Headers
  ws.getRow(1).height = 28;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = col.header;
    cell.font = {
      name: "Arial",
      bold: true,
      color: { argb: `FF${GOLD}` },
      size: 10,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${NAVY}` },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = cellBorder(BORDER_GOLD);
    ws.getColumn(i + 1).width = col.width;
  });

  // Row 2 — Required / optional markers
  ws.getRow(2).height = 18;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = col.required ? "REQUIRED" : "optional";
    cell.font = {
      name: "Arial",
      bold: col.required,
      size: 9,
      color: { argb: col.required ? `FF${RED}` : `FF${GREY}` },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${NAVY2}` },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = cellBorder();
  });

  // Row 3 — Hint text
  ws.getRow(3).height = 30;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = col.hint;
    cell.font = {
      name: "Arial",
      italic: true,
      color: { argb: `FF${GREY}` },
      size: 8,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${NAVY2}` },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: false,
    };
    cell.border = cellBorder();
  });

  // Row 4 — Sample product (styled differently so users understand it's an example)
  const sample = [
    "ORL-TRIO-001",
    "Refined Luxury Trio Gift Set",
    15000,
    25000,
    20000,
    "NGN",
    "Gift Sets",
    250,
    5,
    10,
    "Premium gift set featuring three signature scents.",
  ];
  ws.getRow(4).height = 22;
  sample.forEach((value, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = value;
    cell.font = {
      name: "Arial",
      italic: true,
      color: { argb: `FF${GREY}` },
      size: 10,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${SAMPLE}` },
    };
    cell.alignment = {
      horizontal: i === 1 || i === 10 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = cellBorder();
  });

  // Add "EXAMPLE" note in the first cell
  ws.getCell(4, 1).note = "This is a sample row — replace or delete it.";

  // Rows 5–204 — Data entry rows (alternating subtle background)
  for (let row = 5; row <= 204; row++) {
    ws.getRow(row).height = 20;
    const bg = row % 2 === 0 ? "F9F8F4" : "FFFFFF";
    COLUMNS.forEach((_, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.font = { name: "Arial", size: 10, color: { argb: "FF111111" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${bg}` },
      };
      cell.alignment = {
        horizontal: i === 1 || i === 10 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = cellBorder();
    });
  }

  // Currency dropdown validation on column F (index 6), rows 5–204
  ws.dataValidations.add("F5:F204", {
    type: "list",
    allowBlank: true,
    formulae: ['"NGN,USD,GBP,EUR,AED,GHS"'],
    showErrorMessage: true,
    errorTitle: "Invalid currency",
    error:
      "Please enter a 3-letter currency code: NGN, USD, GBP, EUR, AED, GHS",
  });

  // ── Instructions sheet ─────────────────────────────────────────────────────
  const wi = wb.addWorksheet("Instructions");
  wi.getColumn(1).width = 80;

  const lines = [
    {
      text: "Product Import Template — Instructions",
      bold: true,
      size: 14,
      color: NAVY,
    },
    { text: "" },
    { text: "HOW TO USE", bold: true, size: 11 },
    {
      text: "Fill in your products starting from row 5 of the Products sheet.",
    },
    { text: "Row 4 is a sample row — delete or replace it before uploading." },
    {
      text: "Rows 1–3 are locked headers — do not delete or rearrange columns.",
    },
    { text: "" },
    { text: "REQUIRED FIELDS", bold: true, size: 11 },
    { text: "  sku              Must be unique across the entire catalogue." },
    { text: "  name             The product display name." },
    { text: "  cost_price       Number only — no currency symbols." },
    { text: "  selling_price    Must be ≥ cost_price." },
    {
      text: "  currency         3-letter ISO code: NGN, USD, GBP, EUR, AED, GHS.",
    },
    { text: "" },
    { text: "OPTIONAL FIELDS", bold: true, size: 11 },
    {
      text: "  min_selling_price   POS discount floor. Blank defaults to selling_price.",
    },
    {
      text: "  category_name       Must exactly match an existing category name.",
    },
    { text: "  weight_grams        Whole number in grams." },
    {
      text: "  reorder_level       Alert fires when stock drops to this number.",
    },
    { text: "  reorder_quantity    Units to reorder when alert fires." },
    { text: "  description         Free text." },
    { text: "" },
    { text: "IMPORT NOTES", bold: true, size: 11 },
    { text: "  Save as .xlsx before uploading." },
    { text: "  Do not add extra sheets or rename the Products sheet." },
    { text: "  Duplicate SKUs in the same file will be rejected." },
    {
      text: "  SKUs that already exist in the catalogue will be skipped (not overwritten).",
    },
    {
      text: "  A CODE128 barcode is auto-generated for each successfully imported product.",
    },
  ];

  lines.forEach((line, i) => {
    const cell = wi.getCell(i + 1, 1);
    cell.value = line.text;
    cell.font = {
      name: "Arial",
      bold: !!line.bold,
      size: line.size || 10,
      color: { argb: `FF${line.color || "333333"}` },
    };
    cell.alignment = { vertical: "middle" };
    wi.getRow(i + 1).height = line.bold ? 22 : 18;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

// ── Import parsing ───────────────────────────────────────────────────────────

const SAMPLE_SKU = "ORL-TRIO-001";

/** Extract a clean primitive from an ExcelJS cell value (handles formulas,
 *  rich text, hyperlinks, dates). */
function cellVal(cell) {
  const v = cell ? cell.value : null;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (v.result !== undefined) return v.result; // formula cell
    if (typeof v.text === "string") return v.text; // hyperlink
    if (Array.isArray(v.richText))
      return v.richText.map((t) => t.text).join("");
    if (v instanceof Date) return v;
    return null;
  }
  return v;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * Parse a filled import workbook (the buffer of an uploaded .xlsx) into an
 * array of normalized row objects keyed by COLUMNS.key, each with a `_row`
 * (1-based sheet row number) for friendly per-row error messages.
 *
 * Tolerant by design: it maps columns by their header text in row 1 (so the
 * user can reorder columns), skips the locked marker/hint rows, skips the
 * sample row, and skips fully blank rows.
 */
async function parseImportWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws =
    wb.getWorksheet("Products") || wb.worksheets.find((w) => w.rowCount > 1);
  if (!ws) {
    const err = new Error('No "Products" sheet found in the uploaded file.');
    err.status = 400;
    throw err;
  }

  // Map header text (row 1) → our canonical column keys.
  const headerRow = ws.getRow(1);
  const colByKey = {};
  const validKeys = new Set(COLUMNS.map((c) => c.key));
  headerRow.eachCell((cell, colNumber) => {
    const key = asText(cellVal(cell)).toLowerCase();
    if (validKeys.has(key)) colByKey[key] = colNumber;
  });

  if (colByKey.sku === undefined || colByKey.name === undefined) {
    const err = new Error(
      "Could not find the required 'sku' and 'name' columns. Use the official template (Template button) and keep row 1 intact.",
    );
    err.status = 400;
    throw err;
  }

  const rows = [];
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (key) =>
      colByKey[key] !== undefined ? cellVal(row.getCell(colByKey[key])) : null;

    const sku = asText(get("sku"));
    const name = asText(get("name"));

    // Skip the sample row and fully-blank rows.
    if (!sku && !name) continue;
    if (sku === SAMPLE_SKU) continue;

    rows.push({
      _row: r,
      sku,
      name,
      description: asText(get("description")) || null,
      category_name: asText(get("category_name")) || null,
      currency: asText(get("currency")) || null,
      cost_price: get("cost_price"),
      selling_price: get("selling_price"),
      min_selling_price: get("min_selling_price"),
      weight_grams: get("weight_grams"),
      reorder_level: get("reorder_level"),
      reorder_quantity: get("reorder_quantity"),
    });
  }
  return rows;
}

module.exports = { buildTemplate, parseImportWorkbook };
