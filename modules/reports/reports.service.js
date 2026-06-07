"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const documentsService = require("../../shared/documents/documents.service");
const { renderToPDF } = require("../../lib/pdf/generator");
const salesReport = require("./sales.report");
const financeReport = require("./finance.report");
const stockReport = require("./stock.report");
const payrollReport = require("./payroll.report");
const deliveryReport = require("./delivery.report");
const purchasesReport = require("./purchases.report");
const attendanceReport = require("./attendance.report");
const repo = require("./reports.repository");

// ─────────────────────────────────────────────────────────────
// REPORTS SERVICE — Module 17: Dashboards & Reports
//
// Reports = exportable, formatted, long-form. Dashboards (separate
// module) = live interactive widgets.
//
// Pipeline:
//   1. Caller hits /reports/{family}/{type} with a date range
//   2. Route → service.generate(family, type, options)
//   3. Service dispatches to the right report file (sales.report.js,
//      finance.report.js, etc.) which returns a { meta, columns, rows }
//      structure.
//   4. Service formats that structure as JSON, CSV, Excel, or PDF
//      depending on `format` parameter.
//   5. Optional: archive the generated PDF/Excel to shared.documents
//      via documents.service.archiveGeneratedDocument so there's a
//      permanent record.
//
// Permission model: each report family has its own permission key
// (`reports:sales:view`, `reports:finance:view`, etc.) so finance
// reports can be locked down separately from sales reports.
// Sensitive reports (payroll, profit-and-loss) audit every access.
// ─────────────────────────────────────────────────────────────

const REPORT_FAMILIES = {
  sales: salesReport,
  finance: financeReport,
  stock: stockReport,
  payroll: payrollReport,
  delivery: deliveryReport,
  purchases: purchasesReport,
  attendance: attendanceReport,
};

const SUPPORTED_FORMATS = ["json", "csv", "pdf", "excel"];

/**
 * Generate a report and return it in the requested format.
 *
 * @param {Object} params
 * @param {string} params.business
 * @param {string} params.family       'sales' | 'finance' | 'stock' | 'payroll' | 'delivery'
 * @param {string} params.reportType   sub-type per family
 * @param {string} params.format       'json' | 'csv' | 'pdf' | 'excel'
 * @param {Object} params.options      family-specific (startDate, endDate, etc.)
 * @param {Object} params.user
 * @param {boolean} [params.archive]   if true, also stores the rendered file in documents
 */
async function generate({
  business,
  family,
  reportType,
  format,
  options,
  user,
  archive,
}) {
  if (!REPORT_FAMILIES[family]) {
    throw Object.assign(
      new Error(
        `Invalid report family. Allowed: ${Object.keys(REPORT_FAMILIES).join(", ")}`,
      ),
      { status: 400 },
    );
  }
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw Object.assign(
      new Error(`Format must be one of: ${SUPPORTED_FORMATS.join(", ")}`),
      { status: 400 },
    );
  }

  const result = await withBusinessContext(business, async (client) => {
    return REPORT_FAMILIES[family].generate(client, {
      reportType,
      ...options,
    });
  });

  // Audit every report access — sensitive ones marked with sensitive=true.
  await withBusinessContext(business, (client) =>
    auditService.log(client, {
      userId: user?.user_id || null,
      userName: user?.display_name || "system",
      business,
      module: "reports",
      action: "generate",
      table: `reports.${family}`,
      metadata: {
        report_type: reportType,
        format,
        sensitive: result.meta?.sensitive === true,
        options,
      },
    }),
  );

  // Format conversion.
  let output;
  let mimeType;
  let filename = buildFilename(family, reportType, format);

  switch (format) {
    case "json":
      output = result;
      mimeType = "application/json";
      break;
    case "csv":
      output = renderCSV(result);
      mimeType = "text/csv";
      break;
    case "excel":
      output = await renderExcel(result);
      mimeType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      break;
    case "pdf":
      output = await renderPDF(result);
      mimeType = "application/pdf";
      break;
  }

  // Optional archive to documents.
  if (archive && (format === "pdf" || format === "excel")) {
    try {
      await documentsService.archiveGeneratedDocument({
        buffer: output,
        business,
        documentType: "other",
        title: `${result.meta.title} — ${result.meta.subtitle || ""}`.trim(),
        referenceType: "report",
        tags: ["report", family, reportType],
        user,
      });
    } catch (err) {
      // Archive failure shouldn't block the download.
      console.error("Report archive failed:", err.message);
    }
  }

  return { output, mimeType, filename };
}

// ─────────────────────────────────────────────────────────────
// CSV FORMATTER
// ─────────────────────────────────────────────────────────────

function renderCSV({ columns, rows }) {
  const headers = columns.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => csvEscape(formatValueForExport(row[c.key], c.type)))
      .join(","),
  );
  return Buffer.from([headers, ...lines].join("\n"), "utf-8");
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// EXCEL FORMATTER
//
// SheetJS (xlsx) is in the dependency tree. We assemble an array of
// arrays, plus a small metadata header, and write as an XLSX buffer.
// ─────────────────────────────────────────────────────────────

async function renderExcel({ meta, columns, rows }) {
  let XLSX;
  try {
    XLSX = require("xlsx");
  } catch {
    throw Object.assign(
      new Error(
        "xlsx module not installed — cannot render Excel. Install 'xlsx' to enable.",
      ),
      { status: 501 },
    );
  }

  const sheetData = [];
  sheetData.push([meta.title]);
  if (meta.subtitle) sheetData.push([meta.subtitle]);
  sheetData.push([`Generated: ${meta.generatedAt}`]);
  sheetData.push([]); // blank row separator

  sheetData.push(columns.map((c) => c.label));
  for (const row of rows) {
    sheetData.push(
      columns.map((c) => formatValueForExport(row[c.key], c.type)),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ─────────────────────────────────────────────────────────────
// PDF FORMATTER
//
// Builds an inline HTML page (no template file needed) and pushes
// through Puppeteer via lib/pdf/generator. Pattern matches the
// inline-fallback approach used in pos/receipt.service.
// ─────────────────────────────────────────────────────────────

async function renderPDF(result) {
  const html = buildReportHTML(result);
  // Direct puppeteer call — we don't want a template file requirement
  // for every report variant.
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", right: "12mm", bottom: "15mm", left: "12mm" },
      landscape: true, // wider tables fit better landscape
    });
  } finally {
    await browser.close();
  }
}

function buildReportHTML({ meta, columns, rows }) {
  const headers = columns
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => {
            const v = formatValueForExport(row[c.key], c.type);
            const align = ["int", "decimal", "currency", "percent"].includes(
              c.type,
            )
              ? "right"
              : "left";
            return `<td style="text-align:${align}">${escapeHtml(v)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  const totalsRow = meta.totals
    ? `<div style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
         <strong>Totals:</strong> ${formatTotalsLine(meta.totals)}
       </div>`
    : "";

  const summaryBlock = meta.summary
    ? `<div style="margin-bottom: 16px; padding: 12px; background: #eef; border-radius: 4px;">
         ${formatTotalsLine(meta.summary)}
       </div>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; color: #111; padding: 0; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  .subtitle { color: #555; font-size: 11px; margin-bottom: 4px; }
  .timestamp { color: #888; font-size: 9px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; text-align: left; font-weight: 600; color: #444; border-bottom: 2px solid #ccc; }
  tr:nth-child(even) td { background: #fdfdfd; }
</style></head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  ${meta.subtitle ? `<div class="subtitle">${escapeHtml(meta.subtitle)}</div>` : ""}
  <div class="timestamp">Generated: ${escapeHtml(meta.generatedAt)}</div>
  ${summaryBlock}
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${totalsRow}
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// VALUE FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────

function formatValueForExport(value, type) {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "currency":
      return `₦${parseFloat(value).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${parseFloat(value).toFixed(2)}%`;
    case "int":
      return String(parseInt(value));
    case "decimal":
      return parseFloat(value).toFixed(2);
    case "date":
      return value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
    case "datetime":
      return value instanceof Date
        ? value.toISOString().slice(0, 19).replace("T", " ")
        : String(value).slice(0, 19).replace("T", " ");
    default:
      return String(value);
  }
}

function formatTotalsLine(totals) {
  return Object.entries(totals)
    .map(([k, v]) => {
      const label = k
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const formatted =
        typeof v === "object" && v !== null
          ? JSON.stringify(v)
          : typeof v === "number"
            ? v.toLocaleString("en-NG", { maximumFractionDigits: 2 })
            : v;
      return `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatted)}`;
    })
    .join(" &nbsp;·&nbsp; ");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildFilename(family, reportType, format) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  const ext = { json: "json", csv: "csv", pdf: "pdf", excel: "xlsx" }[format];
  return `${family}-${reportType}-${stamp}.${ext}`;
}

// ─────────────────────────────────────────────────────────────
// SAVED REPORTS
//
// A saved report is a stored report configuration — type, filters,
// columns, sort, optional schedule — that a user can re-run without
// re-entering the parameters. is_shared makes it visible to the
// whole business; otherwise it's private to the creator.
//
// Mutating endpoints enforce ownership: a user can only edit or
// delete a report they created (shared reports are visible to all
// but still owned by one person).
// ─────────────────────────────────────────────────────────────

async function listSavedReports(business, user) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listSavedReports(client, user.user_id);
    return { data };
  });
}

async function getSavedReport(business, reportId, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.findSavedReportById(client, reportId);
    if (!row) {
      throw Object.assign(new Error("Saved report not found"), {
        status: 404,
      });
    }
    // A private report is only visible to its creator.
    if (!row.is_shared && row.created_by !== user.user_id) {
      throw Object.assign(new Error("Saved report not found"), {
        status: 404,
      });
    }
    return row;
  });
}

async function createSavedReport(business, data, user) {
  if (!data.report_name || !data.report_name.trim()) {
    throw Object.assign(new Error("report_name is required"), {
      status: 400,
    });
  }
  if (!data.report_type) {
    throw Object.assign(new Error("report_type is required"), {
      status: 400,
    });
  }
  return withBusinessContext(business, async (client) => {
    const row = await repo.insertSavedReport(client, {
      createdBy: user.user_id,
      reportName: data.report_name.trim(),
      reportType: data.report_type,
      filters: data.filters,
      columns: data.columns,
      sortConfig: data.sort_config,
      isShared: data.is_shared,
      schedule: data.schedule,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "reports",
      action: "create",
      table: "saved_reports",
      recordId: row.report_id,
      after: row,
    });
    return row;
  });
}

async function updateSavedReport(business, reportId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findSavedReportById(client, reportId);
    if (!before) {
      throw Object.assign(new Error("Saved report not found"), {
        status: 404,
      });
    }
    if (before.created_by !== user.user_id) {
      throw Object.assign(new Error("You can only edit a report you created"), {
        status: 403,
      });
    }
    const row = await repo.updateSavedReport(client, reportId, {
      reportName: data.report_name ? data.report_name.trim() : null,
      filters: data.filters,
      columns: data.columns,
      sortConfig: data.sort_config,
      isShared: data.is_shared,
      schedule: data.schedule,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "reports",
      action: "edit",
      table: "saved_reports",
      recordId: reportId,
      before,
      after: row,
    });
    return row;
  });
}

async function deleteSavedReport(business, reportId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findSavedReportById(client, reportId);
    if (!before) {
      throw Object.assign(new Error("Saved report not found"), {
        status: 404,
      });
    }
    if (before.created_by !== user.user_id) {
      throw Object.assign(
        new Error("You can only delete a report you created"),
        { status: 403 },
      );
    }
    await repo.deleteSavedReport(client, reportId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "reports",
      action: "delete",
      table: "saved_reports",
      recordId: reportId,
      before,
    });
    return { deleted: true };
  });
}

module.exports = {
  generate,
  REPORT_FAMILIES: Object.keys(REPORT_FAMILIES),
  SUPPORTED_FORMATS,
  // saved reports
  listSavedReports,
  getSavedReport,
  createSavedReport,
  updateSavedReport,
  deleteSavedReport,
};
