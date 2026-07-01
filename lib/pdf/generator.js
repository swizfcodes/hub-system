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

  // Every template renders under the deployment's identity —
  // {{brand_name}}, {{brand_tagline}}, {{brand_company}} are always
  // available. Caller-provided keys win on collision.
  const { getPlatformBrand } = require("../branding");
  const brand = await getPlatformBrand();

  // Resolve the platform logo to an inline base64 data URI. Puppeteer renders
  // via setContent() with no base URL, so a normal "/assets/..." path or a
  // remote URL would never load. brand_logo holds the data URI (or "") and
  // brand_logo_img holds a ready-to-drop <img> tag (or "" when no logo is
  // configured, so templates never show a broken-image icon).
  const brandLogo = await resolveLogoDataUri(brand.logo_dark_url);
  const brandLogoImg = brandLogo
    ? `<img class="brand-logo" src="${brandLogo}" alt="${String(
        brand.product_name || "",
      ).replace(/"/g, "&quot;")} logo" />`
    : "";

  data = {
    brand_name: brand.product_name,
    brand_tagline: brand.tagline,
    brand_company: brand.company_name,
    brand_logo: brandLogo,
    brand_logo_img: brandLogoImg,
    ...data,
  };

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

// Logo data-URI cache so we read + base64-encode the file at most once per
// source path (PDF rendering is a hot path).
const _logoCache = new Map();

async function resolveLogoDataUri(logoUrl) {
  if (!logoUrl) return "";
  if (_logoCache.has(logoUrl)) return _logoCache.get(logoUrl);

  let dataUri = "";
  try {
    // Already a data URI — use as-is.
    if (logoUrl.startsWith("data:")) {
      dataUri = logoUrl;
    } else {
      // Map a web path like "/assets/images/logos/orika-logo-black.png" onto
      // the bundled client assets on disk. Try the built dist first, then the
      // source public/ folder.
      const rel = logoUrl.replace(/^\//, "");
      const candidates = [
        path.join(__dirname, "../../client/public", rel),
        path.join(__dirname, "../../client/dist", rel),
      ];
      const file = candidates.find((p) => fs.existsSync(p));
      if (file) {
        const ext = path.extname(file).toLowerCase().replace(".", "");
        const mime =
          ext === "svg"
            ? "image/svg+xml"
            : ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : `image/${ext || "png"}`;
        const b64 = fs.readFileSync(file).toString("base64");
        dataUri = `data:${mime};base64,${b64}`;
      } else {
        logger.warn(`[pdf] logo asset not found on disk for ${logoUrl}`);
      }
    }
  } catch (err) {
    logger.warn(`[pdf] could not embed logo ${logoUrl}: ${err.message}`);
    dataUri = "";
  }

  _logoCache.set(logoUrl, dataUri);
  return dataUri;
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
