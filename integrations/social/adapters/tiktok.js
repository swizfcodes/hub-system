"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");
const fs = require("fs");

const BASE = "https://open.tiktokapis.com/v2";

// TikTok video upload uses a two-step: init then upload chunks
async function uploadVideo({ filePath, title, description }) {
  const buffer = fs.readFileSync(filePath);
  const fileSize = buffer.length;

  // Step 1: Init upload
  const { data: init } = await axios.post(
    `${BASE}/post/video/init/`,
    {
      post_info: { title, privacy_level: "SELF_ONLY", disable_comment: false },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${config.tiktok.accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  const uploadUrl = init.data.upload_url;
  const publishId = init.data.publish_id;

  // Step 2: Upload binary
  await axios.put(uploadUrl, buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
    },
  });

  logger.info(`TikTok video uploaded, publish_id: ${publishId}`);
  return publishId;
}

module.exports = { uploadVideo };
