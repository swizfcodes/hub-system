"use strict";

/* eslint-disable no-console */

// ─────────────────────────────────────────────────────────────
// scripts/fixLogoBackground.js
//
// Re-processes uploaded brand logos so they sit cleanly on any
// email/header surface:
//
//   • strips the flattened background (the uploaded Orika logo was
//     white-on-black with JPEG halo artifacts — it rendered as a hard
//     black box on the espresso header band)
//   • rebuilds monochrome marks as clean ink + smooth alpha, which
//     erases compression halos entirely
//   • trims to content, pads evenly, caps width at 600px (2× the
//     300px max display size), and saves as PNG (transparent WebP is
//     fine in Gmail/Apple Mail but classic Outlook can't show WebP)
//   • updates shared.business_config.logo_path to the new file —
//     the original upload is left untouched on disk
//
// Run ON THE SERVER (needs the uploads dir + database):
//
//   node scripts/fixLogoBackground.js                  # all active businesses
//   node scripts/fixLogoBackground.js --business diffusers
//   node scripts/fixLogoBackground.js --dry-run        # analyse, change nothing
//
// Then restart the app (pm2 restart hub-api) so the brand cache
// picks up the new logo_path.
// ─────────────────────────────────────────────────────────────

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { pool } = require("../config/db");
const config = require("../config/config");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const onlyBusiness = (() => {
  const i = args.indexOf("--business");
  return i >= 0 ? args[i + 1] : null;
})();

const UPLOADS_ROOT = path.resolve(config.storage?.localPath || "./uploads");

function localPathFor(logoPath) {
  if (!logoPath) return null;
  // Stored values look like /uploads/logos/<file> or logos/<file>
  const rel = String(logoPath)
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/?uploads\//, "")
    .replace(/^\//, "");
  return path.join(UPLOADS_ROOT, rel);
}

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Median colour of the outer 2px border — the flattened background. */
function borderColor(data, width, height, channels) {
  const rs = [], gs = [], bs = [];
  const push = (x, y) => {
    const i = (y * width + x) * channels;
    rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0); push(x, height - 1);
    if (height > 3) { push(x, 1); push(x, height - 2); }
  }
  for (let y = 0; y < height; y++) {
    push(0, y); push(width - 1, y);
    if (width > 3) { push(1, y); push(width - 2, y); }
  }
  const median = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  return { r: median(rs), g: median(gs), b: median(bs) };
}

async function processLogo(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const bg = borderColor(data, width, height, channels);
  const bgLum = lum(bg.r, bg.g, bg.b);
  const darkBg = bgLum < 0.45;

  // Is the mark essentially monochrome? Sample non-background pixels'
  // saturation; if low, we can rebuild it as pure ink + alpha, which
  // wipes out JPEG halos completely.
  let satSum = 0;
  let satCount = 0;
  for (let i = 0; i < data.length; i += channels * 7) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const distBg = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
    if (distBg < 60) continue; // background-ish pixel
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    satCount++;
  }
  const monochrome = satCount === 0 || satSum / satCount < 0.18;

  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    const o = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = channels === 4 ? data[i + 3] : 255;
    const pl = lum(r, g, b);

    let alpha;
    let ink;
    if (monochrome && darkBg) {
      // Light mark on dark bg → white ink, luminance as alpha.
      alpha = smoothstep((pl - 0.1) / 0.55);
      ink = { r: 255, g: 255, b: 255 };
    } else if (monochrome && !darkBg) {
      // Dark mark on light bg → keep the mark's own colour.
      alpha = smoothstep((1 - pl - 0.08) / 0.55);
      ink = { r, g, b };
    } else {
      // Colour mark → alpha from distance to the background colour.
      const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b) / 441.7;
      alpha = smoothstep((dist - 0.1) / 0.45);
      ink = { r, g, b };
    }

    const finalA = Math.round(alpha * (a / 255) * 255);
    out[o] = ink.r;
    out[o + 1] = ink.g;
    out[o + 2] = ink.b;
    out[o + 3] = finalA;
  }

  // Content bounding box (alpha > 8), padded evenly.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (out[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("nothing left after background removal — is the image a solid colour?");

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.06);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropW = Math.min(width, maxX + pad + 1) - left;
  const cropH = Math.min(height, maxY + pad + 1) - top;

  let pipeline = sharp(out, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH });
  if (cropW > 600) pipeline = pipeline.resize({ width: 600 });

  return {
    png: await pipeline.png({ compressionLevel: 9 }).toBuffer(),
    mode: monochrome ? (darkBg ? "white ink on transparent" : "dark ink on transparent") : "colour-keyed transparency",
    bg: `rgb(${bg.r},${bg.g},${bg.b})`,
  };
}

async function main() {
  const { rows } = await pool.query(
    `SELECT business_key, display_name, logo_path
       FROM shared.business_config
      WHERE is_active = true
        AND logo_path IS NOT NULL
        ${onlyBusiness ? "AND business_key = $1" : ""}
      ORDER BY business_key`,
    onlyBusiness ? [onlyBusiness] : [],
  );

  if (!rows.length) {
    console.log("No active businesses with a logo_path found.");
    return;
  }

  for (const row of rows) {
    const src = localPathFor(row.logo_path);
    console.log(`\n— ${row.business_key} (${row.display_name})`);
    console.log(`  current logo: ${row.logo_path}`);

    if (!src || !fs.existsSync(src)) {
      console.log(`  ✗ file not found on disk at ${src} — skipping`);
      continue;
    }
    if (/-transparent-\d+\.png$/.test(src)) {
      console.log("  ✓ already processed — skipping");
      continue;
    }

    try {
      const { png, mode, bg } = await processLogo(src);
      const base = path.basename(src).replace(/\.[a-z0-9]+$/i, "");
      const outName = `${base}-transparent-${Date.now()}.png`;
      const outFile = path.join(path.dirname(src), outName);
      const newLogoPath = `/uploads/logos/${outName}`;

      console.log(`  detected background ${bg} → ${mode}`);
      if (DRY_RUN) {
        console.log(`  [dry-run] would write ${outFile} and set logo_path=${newLogoPath}`);
        continue;
      }

      await fs.promises.writeFile(outFile, png);
      await pool.query(
        `UPDATE shared.business_config SET logo_path = $1 WHERE business_key = $2`,
        [newLogoPath, row.business_key],
      );
      // Stored staff signatures embed the logo URL — point them at the
      // processed file too, otherwise staff emails keep the boxed logo.
      const { rowCount: sigCount } = await pool.query(
        `UPDATE shared.email_signatures
            SET html_content = replace(html_content, $1, $2)
          WHERE business = $3 AND html_content LIKE '%' || $1 || '%'`,
        [row.logo_path, newLogoPath, row.business_key],
      );
      console.log(`  ✓ wrote ${outName} (${(png.length / 1024).toFixed(1)} KB)`);
      console.log(`  ✓ logo_path updated (original file kept on disk)`);
      if (sigCount) console.log(`  ✓ refreshed logo in ${sigCount} staff signature(s)`);
    } catch (err) {
      console.log(`  ✗ failed: ${err.message}`);
    }
  }

  console.log("\nDone. Restart the app (pm2 restart hub-api) so emails pick up the new logo.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
