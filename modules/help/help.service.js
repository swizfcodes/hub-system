"use strict";

const { withSharedContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./help.repository");

async function listArticles(query) {
  return withSharedContext((client) =>
    repo.listArticles(client, {
      module: query.module,
      type: query.type,
      publishedOnly: query.include_drafts !== "true",
    }),
  );
}

async function getArticle(articleId) {
  return withSharedContext(async (client) => {
    const row = await repo.findById(client, articleId);
    if (!row)
      throw Object.assign(new Error("Article not found"), { status: 404 });
    return row;
  });
}

async function listModules() {
  return withSharedContext((client) => repo.listModules(client));
}

async function createArticle(data, user) {
  return withSharedContext(async (client) => {
    const row = await repo.insertArticle(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "help",
      action: "create",
      table: "shared.help_articles",
      recordId: row.article_id,
      after: row,
    });
    return row;
  });
}

async function updateArticle(articleId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findById(client, articleId);
    if (!before)
      throw Object.assign(new Error("Article not found"), { status: 404 });
    const after = await repo.updateArticle(client, articleId, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "help",
      action: "update",
      table: "shared.help_articles",
      recordId: articleId,
      before,
      after,
    });
    return after;
  });
}

async function deleteArticle(articleId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findById(client, articleId);
    if (!before)
      throw Object.assign(new Error("Article not found"), { status: 404 });
    await repo.deleteArticle(client, articleId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "help",
      action: "delete",
      table: "shared.help_articles",
      recordId: articleId,
      before,
    });
    return { deleted: true };
  });
}

module.exports = {
  listArticles,
  getArticle,
  listModules,
  createArticle,
  updateArticle,
  deleteArticle,
};
