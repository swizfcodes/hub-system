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

// Bundled with the app, so this file always exists on disk regardless of
// deployment state — the last resort in the logo fallback chain below,
// guaranteeing a document never ships without a mark in the header.
const DEFAULT_LOGO_PATH = "/assets/images/logos/orika-logo-black.png";

// Render an HTML template to a PDF buffer. `business` is the business_key
// the document belongs to (invoice, receipt, delivery note, ...) — pass it
// so the header shows that business's own legal name / registration number
// / logo instead of the generic platform identity.
async function renderToPDF(templateName, data, business) {
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

  // Every template renders under an identity — {{brand_name}},
  // {{brand_tagline}}, {{brand_company}} are always available. Caller-
  // provided keys win on collision.
  const { getPlatformBrand } = require("../branding");
  const { getBusinessConfig } = require("../../config/businesses");
  const brand = await getPlatformBrand();
  const biz = business ? getBusinessConfig(business) : null;

  // {{brand_name}} is the business's own official name where we know it —
  // the legal_name a document's letterhead is supposed to carry — falling
  // back to the deployment-wide identity only when no business context was
  // given or the business has no config row.
  const brandName = biz?.legal_name || brand.company_name || brand.product_name;

  // {{brand_tagline}} carries the registration line instead of a marketing
  // tagline: RC (CAC) number first, then TIN, else left blank.
  const regLine = biz?.cac_number
    ? `RC ${biz.cac_number}`
    : biz?.tin
      ? `TIN ${biz.tin}`
      : "";

  // Logo fallback chain: this business's own uploaded logo → the platform-
  // wide logo → the bundled default. Resolved in order so a PDF always
  // carries a mark and generation never stalls for lack of one.
  const logoCandidates = [
    biz?.logo_path,
    brand.logo_dark_url,
    DEFAULT_LOGO_PATH,
  ].filter(Boolean);

  let brandLogo = "";
  for (const candidate of logoCandidates) {
    brandLogo = await resolveLogoDataUri(candidate);
    if (brandLogo) break;
  }
  const brandLogoImg = brandLogo
    ? `<img class="brand-logo" src="${brandLogo}" alt="${String(
        brandName || "",
      ).replace(/"/g, "&quot;")} logo" />`
    : "";

  data = {
    brand_name: brandName,
    brand_tagline: regLine,
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
      // Map a web path onto disk. Bundled defaults live under the client
      // assets ("/assets/images/logos/..."); uploaded logos live under the
      // configured storage root ("/uploads/logos/..." by default) — a
      // different tree entirely, so both must be searched.
      const rel = logoUrl.replace(/^\//, "");
      const config = require("../../config/config");
      const uploadsRoot = path.resolve(config.storage?.localPath || "./uploads");
      const candidates = [
        path.join(__dirname, "../../client/public", rel),
        path.join(__dirname, "../../client/dist", rel),
        path.join(uploadsRoot, rel.replace(/^uploads\//, "")),
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
