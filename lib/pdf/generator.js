"use strict";

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const logger = require("../../config/logger");

let browser;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browser;
}

// Render an HTML template to a PDF buffer
async function renderToPDF(templateName, data) {
  const templatePath = path.join(
    __dirname,
    "../../templates",
    templateName,
    "index.html",
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  let html = fs.readFileSync(templatePath, "utf8");

  // Simple token replacement: {{key}} → value.
  // Use a replacer function so strings containing $ (e.g. pre-rendered HTML)
  // are never misinterpreted as special replacement patterns by JS.
  for (const [key, value] of Object.entries(flattenObject(data))) {
    const safe = () => String(value ?? "");
    html = html.replaceAll(`{{${key}}}`, safe);
  }

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

function flattenObject(obj, prefix = "") {
  return Object.entries(obj).reduce((acc, [key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(acc, flattenObject(val, fullKey));
    } else {
      acc[fullKey] = val;
    }
    return acc;
  }, {});
}

async function closeBrowser() {
  if (browser?.isConnected()) await browser.close();
}

module.exports = { renderToPDF, closeBrowser };
