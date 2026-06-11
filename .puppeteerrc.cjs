const { join } = require("path");

module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};

// INSTALLATION
// npx puppeteer browsers install chrome
