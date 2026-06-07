"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");

const GRAPH_URL = "https://graph.facebook.com/v18.0";
const IG_ID = config.meta.igBusinessId;
const TOKEN = config.meta.accessToken;

// Create a single image post
async function createImagePost({ imageUrl, caption }) {
  // Step 1: Create media container
  const { data: container } = await axios.post(
    `${GRAPH_URL}/${IG_ID}/media`,
    { image_url: imageUrl, caption },
    { params: { access_token: TOKEN } },
  );

  // Step 2: Publish
  const { data: published } = await axios.post(
    `${GRAPH_URL}/${IG_ID}/media_publish`,
    { creation_id: container.id },
    { params: { access_token: TOKEN } },
  );

  logger.info(`Instagram post published: ${published.id}`);
  return published.id;
}

// Create a carousel post (multiple images)
async function createCarouselPost({ imageUrls, caption }) {
  const items = await Promise.all(
    imageUrls.map((imageUrl) =>
      axios
        .post(
          `${GRAPH_URL}/${IG_ID}/media`,
          { image_url: imageUrl, is_carousel_item: true },
          { params: { access_token: TOKEN } },
        )
        .then((r) => r.data.id),
    ),
  );

  const { data: container } = await axios.post(
    `${GRAPH_URL}/${IG_ID}/media`,
    { media_type: "CAROUSEL", children: items.join(","), caption },
    { params: { access_token: TOKEN } },
  );

  const { data: published } = await axios.post(
    `${GRAPH_URL}/${IG_ID}/media_publish`,
    { creation_id: container.id },
    { params: { access_token: TOKEN } },
  );

  return published.id;
}

module.exports = { createImagePost, createCarouselPost };
