"use strict";

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const config = require("../../config/config");

const s3 = new S3Client({ region: config.storage.s3Region });
const BUCKET = config.storage.s3Bucket;

async function save(buffer, filename, subfolder = "") {
  const safeName = `${subfolder}/${Date.now()}-${filename}`.replace(
    /\/+/g,
    "/",
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: safeName,
      Body: buffer,
    }),
  );
  return {
    filePath: safeName,
    fileSize: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

async function get(filePath) {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: filePath }),
  );
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function remove(filePath) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: filePath }));
}

module.exports = { save, get, remove };
