-- ============================================================
-- 000079 — Help Center revamp: newcomer orientation content
--
-- The Help Center was rebuilt for people with no ERP background:
-- forgiving search, plain-language task shortcuts, browse-by-area,
-- a readable article view, and a glossary. The scaffolding lives in
-- the front-end; this migration fills a genuine content gap by adding
-- "find your way around" orientation guides to the General / Getting
-- Started section so first-time, non-technical users land somewhere
-- useful.
--
-- Additive only — these supplement the articles seeded in 000050.
-- Safe to run once (the migrator tracks applied migrations); there is
-- no unique constraint on (module, title), so no ON CONFLICT needed.
-- ============================================================

INSERT INTO shared.help_articles (module, title, content, article_type, display_order) VALUES

-- ── Orientation guides ───────────────────────────────────────
('general', 'Finding your way around the screen',
 '<h3>The three things on every screen</h3><p>Once you know these, you can reach anything:</p><ol><li><strong>The sidebar (left edge)</strong> — your main menu. Each item opens a different part of the system (Sales, Invoices, Stock, and so on). On a phone, tap the ☰ menu button to open it.</li><li><strong>The top bar</strong> — shows where you are. It also has a <strong>search button</strong> and a <strong>bell</strong> for notifications.</li><li><strong>The business switcher (top-left)</strong> — shows which business you''re looking at. Click it to switch.</li></ol><h3>The help button</h3><p>See the round <strong>?</strong> button in the bottom-right corner? Tap it on any page to jump straight to help for whatever you''re working on. It''s always there if you get lost.</p><h3>Finding your way back</h3><p>At the top of a page you''ll often see a trail like <em>Help Center › Invoices › …</em>. Click any part of the trail to step back. Clicking the product name or home icon always returns you to your starting page.</p>',
 'guide', 2),

('general', 'Using search to find anything fast',
 '<h3>One box, everything</h3><p>The quickest way to get somewhere is to <strong>search</strong>. You don''t need to know the right menu — just describe what you want.</p><h3>Two searches, two jobs</h3><ul><li><strong>Top-bar search</strong> (the magnifying glass, or press <strong>Ctrl/⌘ + K</strong>) — jumps to records and pages: a customer, an invoice number, a product.</li><li><strong>Help Center search</strong> — finds answers and how-to guides. Type the problem in your own words, e.g. <em>"refund a customer"</em> or <em>"add staff"</em>.</li></ul><h3>Tips for better results</h3><ul><li>Use fewer, simpler words — one good keyword (like <em>invoice</em> or <em>stock</em>) beats a long sentence.</li><li>Don''t worry about exact wording — search understands everyday terms (type <em>"bill"</em> and you''ll still find invoices).</li><li>Stuck on a word? Open <strong>Words explained</strong> in the Help Center for plain-English definitions.</li></ul>',
 'guide', 3),

-- ── Orientation FAQs ─────────────────────────────────────────
('general', 'How do I get back to the home screen?',
 '<p>Click the <strong>product name or logo</strong> at the top of the sidebar, or the first item in the breadcrumb trail at the top of a page. Either takes you back to your main home screen.</p>',
 'faq', 5),

('general', 'Why does my screen look different from a colleague''s?',
 '<p>What each person sees depends on their <strong>role</strong>. Roles decide which modules and buttons appear, so a salesperson and an accountant see different menus. This is normal — you''re only shown the parts of the system you need. If you think you''re missing something you should have, ask your system administrator to review your role.</p>',
 'faq', 6),

('general', 'Is my work saved automatically, or do I need to click Save?',
 '<p>It depends on the screen. Forms (like creating an invoice or a product) have a clear <strong>Save</strong> or <strong>Create</strong> button — your changes aren''t kept until you click it. Quick edits, drag-and-drop changes, and status updates usually save instantly. When in doubt, look for a confirmation message in the corner of the screen after an action.</p>',
 'faq', 7),

('general', 'I found a problem or something looks wrong — what do I do?',
 '<p>First, refresh the page — that clears most temporary glitches. If it persists, note what you were doing and let your <strong>system administrator</strong> know (you can reach them through <strong>Messaging</strong>). Every action is recorded in the audit log, so an admin can usually trace what happened and put it right.</p>',
 'faq', 8);
