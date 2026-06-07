"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../../config/config");

const BASE_PATH = config.storage.localPath;

if (!fs.existsSync(BASE_PATH)) fs.mkdirSync(BASE_PATH, { recursive: true });

async function save(buffer, filename, subfolder = "") {
  const dir = path.join(BASE_PATH, subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, buffer);

  return {
    filePath: path.join(subfolder, safeName),
    fileSize: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

async function get(filePath) {
  return fs.readFileSync(path.join(BASE_PATH, filePath));
}

async function remove(filePath) {
  const full = path.join(BASE_PATH, filePath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

module.exports = { save, get, remove };
