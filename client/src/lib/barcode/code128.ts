/**
 * Dependency-free CODE 128 (Set B) → SVG renderer.
 *
 * Why hand-rolled instead of a library: the catalogue's auto-generated
 * primary barcodes are CODE128 over uppercase letters, digits and dashes —
 * all within Code 128 Set B. A ~2KB encoder avoids adding a runtime dep
 * (and a build step we can't verify here) just to draw bars.
 *
 * For thermal/ZPL printing the printer renders the barcode itself from the
 * raw value (see lib/print/zpl.ts), so this module is only for on-screen
 * preview and the browser-print fallback.
 */

// Code 128 bar/space module-width patterns, indexed by symbol value (0–106).
// Each string is a run of module widths, alternating bar, space, bar, …
const PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

const START_B = 104;
const STOP = 106;

/** Return the array of symbol values for a Set-B encoding of `value`. */
function encodeB(value: string): number[] {
  const codes: number[] = [START_B];
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    // Clamp to printable ASCII range Set B can express (32–126).
    const v = c >= 32 && c <= 126 ? c - 32 : 0;
    codes.push(v);
  }
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103); // checksum
  codes.push(STOP);
  return codes;
}

export interface Code128Options {
  /** Module (narrowest bar) width in px. Default 2. */
  moduleWidth?: number;
  /** Bar height in px. Default 64. */
  height?: number;
  /** Render the human-readable value beneath the bars. Default true. */
  showText?: boolean;
  /** Quiet-zone (margin) in modules each side. Default 10. */
  quietZone?: number;
  /** Bar colour. Default #111. */
  color?: string;
  /** Background colour. Default #fff. */
  background?: string;
}

/**
 * Render `value` as a self-contained CODE128 `<svg>` string.
 * Returns null if `value` is empty.
 */
export function code128SVG(
  value: string,
  opts: Code128Options = {},
): string | null {
  if (!value) return null;
  const moduleWidth = opts.moduleWidth ?? 2;
  const height = opts.height ?? 64;
  const showText = opts.showText ?? true;
  const quiet = opts.quietZone ?? 10;
  const color = opts.color ?? "#111111";
  const background = opts.background ?? "#ffffff";
  const textH = showText ? 18 : 0;

  const codes = encodeB(value);
  const pattern = codes.map((c) => PATTERNS[c]).join("");

  // Total module count = quiet zones + sum of all element widths.
  let totalModules = quiet * 2;
  for (const ch of pattern) totalModules += Number(ch);

  const width = totalModules * moduleWidth;
  const fullH = height + textH + 6;

  const rects: string[] = [];
  let x = quiet * moduleWidth;
  let isBar = true; // patterns always start with a bar
  for (const ch of pattern) {
    const w = Number(ch) * moduleWidth;
    if (isBar) {
      rects.push(
        `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${color}"/>`,
      );
    }
    x += w;
    isBar = !isBar;
  }

  const text = showText
    ? `<text x="${(width / 2).toFixed(2)}" y="${height + textH}" text-anchor="middle" font-family="monospace" font-size="14" letter-spacing="1" fill="${color}">${escapeXml(value)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${fullH.toFixed(0)}" ` +
    `viewBox="0 0 ${width.toFixed(0)} ${fullH.toFixed(0)}" role="img" aria-label="Barcode ${escapeXml(value)}">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    rects.join("") +
    text +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c] as string,
  );
}
