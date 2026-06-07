"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");

const GRAPH_URL = "https://graph.facebook.com/v18.0";
const PAGE_ID = config.meta.fbPageId;
const TOKEN = config.meta.accessToken;

async function createPost({ message, imageUrl }) {
  const endpoint = imageUrl
    ? `${GRAPH_URL}/${PAGE_ID}/photos`
    : `${GRAPH_URL}/${PAGE_ID}/feed`;

  const body = imageUrl ? { url: imageUrl, caption: message } : { message };

  const { data } = await axios.post(endpoint, body, {
    params: { access_token: TOKEN },
  });

  logger.info(`Facebook post published: ${data.id}`);
  return data.id;
}

module.exports = { createPost };
