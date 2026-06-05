"use strict";

async function listArticles(client, { module, type, publishedOnly = true }) {
  const { rows } = await client.query(
    `SELECT article_id, module, title, content, article_type,
            display_order, is_published, created_at, updated_at
     FROM shared.help_articles
     WHERE ($1::TEXT IS NULL OR module = $1)
       AND ($2::TEXT IS NULL OR article_type = $2)
       AND ($3::BOOLEAN = false OR is_published = true)
     ORDER BY module ASC, display_order ASC, created_at ASC`,
    [module || null, type || null, publishedOnly],
  );
  return rows;
}

async function findById(client, articleId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.help_articles WHERE article_id = $1`,
    [articleId],
  );
  return row || null;
}

async function insertArticle(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.help_articles
       (module, title, content, article_type, display_order, is_published)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.module,
      data.title,
      data.content || "",
      data.article_type || "guide",
      data.display_order ?? 0,
      data.is_published !== false,
    ],
  );
  return row;
}

async function updateArticle(client, articleId, fields) {
  const allowed = [
    "module",
    "title",
    "content",
    "article_type",
    "display_order",
    "is_published",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return findById(client, articleId);
  sets.push(`updated_at = now()`);
  values.push(articleId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.help_articles
     SET ${sets.join(", ")}
     WHERE article_id = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

async function deleteArticle(client, articleId) {
  const result = await client.query(
    `DELETE FROM shared.help_articles WHERE article_id = $1`,
    [articleId],
  );
  return result.rowCount > 0;
}

async function listModules(client) {
  const { rows } = await client.query(
    `SELECT DISTINCT module, COUNT(*)::int AS article_count
     FROM shared.help_articles
     WHERE is_published = true
     GROUP BY module
     ORDER BY module ASC`,
  );
  return rows;
}

module.exports = {
  listArticles,
  findById,
  insertArticle,
  updateArticle,
  deleteArticle,
  listModules,
};
