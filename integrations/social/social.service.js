"use strict";

const instagram = require("./adapters/instagram");
const facebook = require("./adapters/facebook");
const tiktok = require("./adapters/tiktok");
const youtube = require("./adapters/youtube");
const logger = require("../../config/logger");

const ADAPTERS = { instagram, facebook, tiktok, youtube };

// Publish a post to one or more channels
async function publishPost({
  channels = [],
  imageUrls = [],
  caption,
  videoPath,
  title,
  description,
}) {
  const results = [];

  for (const channel of channels) {
    const adapter = ADAPTERS[channel];
    if (!adapter) {
      results.push({ channel, status: "error", error: "Unknown channel" });
      continue;
    }

    try {
      let postId;
      if (channel === "instagram") {
        postId =
          imageUrls.length > 1
            ? await instagram.createCarouselPost({ imageUrls, caption })
            : await instagram.createImagePost({
                imageUrl: imageUrls[0],
                caption,
              });
      } else if (channel === "facebook") {
        postId = await facebook.createPost({
          message: caption,
          imageUrl: imageUrls[0],
        });
      } else if (channel === "tiktok" && videoPath) {
        postId = await tiktok.uploadVideo({
          filePath: videoPath,
          title,
          description,
        });
      } else if (channel === "youtube" && videoPath) {
        postId = await youtube.uploadVideo({
          filePath: videoPath,
          title,
          description,
        });
      }
      results.push({ channel, status: "published", postId });
      logger.info(`Post published to ${channel}: ${postId}`);
    } catch (err) {
      results.push({ channel, status: "failed", error: err.message });
      logger.error(`Failed to publish to ${channel}`, err);
    }
  }

  return results;
}

module.exports = { publishPost };
