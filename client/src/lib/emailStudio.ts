// ── lib/emailStudio.ts ────────────────────────────────────────────────────────
// Block-based email studio: design model helpers + compiler.
//
// THE GOLDEN RULE OF EMAIL HTML: it is not web HTML. Outlook renders with
// Word's engine and Gmail strips <style> tags, so everything here compiles
// to nested tables with inline CSS only. Users never touch the HTML — they
// edit blocks, we guarantee the output renders everywhere.
//
// compileEmailHtml() output goes into campaigns.html_content and is sent
// as-is by the backend (scheduler.service.js), which then substitutes
// {{customer_name}}, {{first_name}} and {{unsubscribe_url}} per recipient.

import type {
  EmailBlock,
  EmailBlockType,
  EmailDesign,
  EmailTheme,
} from "@typedefs/campaigns";

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_THEME: EmailTheme = {
  background: "#F5F2EC", // warm paper
  content: "#FFFFFF",
  accent: "#C9A227", // Orika gold
  text: "#1F1F1F",
};

let counter = 0;
function blockId(): string {
  counter += 1;
  return `blk_${Date.now().toString(36)}_${counter}`;
}

/** A fresh block of the given type with sensible starter content. */
export function newBlock(type: EmailBlockType): EmailBlock {
  const base: EmailBlock = { id: blockId(), type };
  switch (type) {
    case "header":
      return { ...base, text: "Your Brand", imageUrl: "" };
    case "hero":
      return { ...base, imageUrl: "", alt: "", href: "" };
    case "heading":
      return { ...base, text: "A headline that earns the open", align: "left" };
    case "text":
      return {
        ...base,
        text: "Hi {{first_name}},\n\nWrite your message here.",
      };
    case "button":
      return { ...base, label: "Shop Now", href: "https://", align: "center" };
    case "image":
      return { ...base, imageUrl: "", alt: "", href: "" };
    case "divider":
      return base;
    case "spacer":
      return { ...base, height: 24 };
    case "footer":
      return {
        ...base,
        text: "You're receiving this because you subscribed to our updates.",
      };
    default:
      return base;
  }
}

/** Starter design for a brand-new campaign. */
export function defaultDesign(brandName?: string): EmailDesign {
  return {
    version: 1,
    theme: { ...DEFAULT_THEME },
    blocks: [
      { ...newBlock("header"), text: brandName || "Your Brand" },
      newBlock("heading"),
      newBlock("text"),
      newBlock("button"),
      newBlock("divider"),
      newBlock("footer"),
    ],
  };
}

/** True if the design has at least one block with real content. */
export function designHasContent(design: EmailDesign): boolean {
  return design.blocks.some((b) => {
    if (b.type === "heading" || b.type === "text")
      return !!b.text && b.text.trim().length > 0;
    if (b.type === "button") return !!b.label && b.label.trim().length > 0;
    if (b.type === "hero" || b.type === "image")
      return !!b.imageUrl && b.imageUrl.trim().length > 0;
    return false;
  });
}

// ── Compiler ─────────────────────────────────────────────────────────────────

/** Escape user text for HTML. {{tokens}} contain no specials, so they survive. */
function esc(s: string | undefined): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape + convert newlines to <br> for multi-line text blocks. */
function escMultiline(s: string | undefined): string {
  return esc(s).replace(/\r?\n/g, "<br>");
}

/** Only allow http(s) links — anything else becomes '#'. */
function safeHref(href: string | undefined): string {
  const h = (href || "").trim();
  return /^https?:\/\/.+/i.test(h) ? esc(h) : "#";
}

const FONT =
  "Georgia, 'Times New Roman', serif";
const FONT_SANS =
  "Arial, Helvetica, sans-serif";

function renderBlock(b: EmailBlock, t: EmailTheme): string {
  const align = b.align || "left";
  switch (b.type) {
    case "header": {
      const logo = (b.imageUrl || "").trim()
        ? `<img src="${esc(b.imageUrl)}" alt="${esc(b.text)}" height="40" style="display:block;border:0;max-height:40px" />`
        : `<span style="font-family:${FONT};font-size:22px;letter-spacing:2px;color:${t.text};text-transform:uppercase">${esc(b.text)}</span>`;
      return `<tr><td align="center" style="padding:24px 32px;border-bottom:1px solid #EEEAE0">${logo}</td></tr>`;
    }
    case "hero":
    case "image": {
      if (!(b.imageUrl || "").trim()) return "";
      const img = `<img src="${esc(b.imageUrl)}" alt="${esc(b.alt)}" width="600" style="display:block;border:0;width:100%;max-width:600px;height:auto" />`;
      const body = (b.href || "").trim()
        ? `<a href="${safeHref(b.href)}" target="_blank" style="text-decoration:none">${img}</a>`
        : img;
      return `<tr><td style="padding:0">${body}</td></tr>`;
    }
    case "heading":
      return `<tr><td align="${align}" style="padding:28px 32px 8px;font-family:${FONT};font-size:26px;line-height:34px;color:${t.text};font-weight:bold">${esc(b.text)}</td></tr>`;
    case "text":
      return `<tr><td align="${align}" style="padding:12px 32px;font-family:${FONT_SANS};font-size:15px;line-height:24px;color:${t.text}">${escMultiline(b.text)}</td></tr>`;
    case "button":
      // Bulletproof-enough button: a padded td with bgcolor renders in
      // every major client including Outlook (no VML needed at this size).
      return `<tr><td align="${b.align || "center"}" style="padding:20px 32px">
        <table role="presentation" border="0" cellspacing="0" cellpadding="0"><tr>
          <td align="center" bgcolor="${t.accent}" style="border-radius:4px">
            <a href="${safeHref(b.href)}" target="_blank" style="display:inline-block;padding:13px 32px;font-family:${FONT_SANS};font-size:14px;font-weight:bold;letter-spacing:1px;color:#FFFFFF;text-decoration:none;text-transform:uppercase">${esc(b.label)}</a>
          </td>
        </tr></table>
      </td></tr>`;
    case "divider":
      return `<tr><td style="padding:20px 32px"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td style="border-top:1px solid #E5E0D5;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`;
    case "spacer":
      return `<tr><td style="font-size:0;line-height:0;height:${Math.max(4, Math.min(120, b.height || 24))}px">&nbsp;</td></tr>`;
    case "footer":
      return `<tr><td align="center" style="padding:28px 32px;border-top:1px solid #EEEAE0;font-family:${FONT_SANS};font-size:12px;line-height:18px;color:#8A8578">
        ${escMultiline(b.text)}<br><br>
        <a href="{{unsubscribe_url}}" target="_blank" style="color:#8A8578;text-decoration:underline">Unsubscribe</a>
      </td></tr>`;
    default:
      return "";
  }
}

/** Compile a design into complete, send-ready email HTML. */
export function compileEmailHtml(design: EmailDesign): string {
  const t = design.theme || DEFAULT_THEME;
  const rows = design.blocks.map((b) => renderBlock(b, t)).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
</head>
<body style="margin:0;padding:0;background-color:${t.background}">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${t.background}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="${t.content}" style="width:600px;max-width:100%;border-radius:6px;overflow:hidden">
${rows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Preview ──────────────────────────────────────────────────────────────────

/** Compiled HTML with sample values in place of variables, for the iframe. */
export function previewEmailHtml(design: EmailDesign): string {
  return compileEmailHtml(design)
    .replace(/\{\{customer_name\}\}/g, "Adaeze Obi")
    .replace(/\{\{first_name\}\}/g, "Adaeze")
    .replace(/\{\{unsubscribe_url\}\}/g, "#");
}
