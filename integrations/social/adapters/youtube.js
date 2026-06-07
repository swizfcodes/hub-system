"use strict";

const { google } = require("googleapis");
const config = require("../../../config/config");
const logger = require("../../../config/logger");
const fs = require("fs");

const oauth2Client = new google.auth.OAuth2(
  config.youtube.clientId,
  config.youtube.clientSecret,
);
oauth2Client.setCredentials({ refresh_token: config.youtube.refreshToken });

const youtube = google.youtube({ version: "v3", auth: oauth2Client });

async function uploadVideo({
  filePath,
  title,
  description,
  tags = [],
  privacyStatus = "public",
}) {
  const fileSize = fs.statSync(filePath).size;

  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description, tags, categoryId: "22" }, // 22 = People & Blogs
        status: { privacyStatus },
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    },
    {
      onUploadProgress: (evt) => {
        const progress = Math.round((evt.bytesRead / fileSize) * 100);
        logger.debug(`YouTube upload progress: ${progress}%`);
      },
    },
  );

  logger.info(`YouTube video uploaded: ${res.data.id}`);
  return res.data.id;
}

module.exports = { uploadVideo };
