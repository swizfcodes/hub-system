module.exports = {
  displayName: "hub-system-tests",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  moduleNameMapper: {
    "^bcrypt$": "<rootDir>/node_modules/bcryptjs",
  },
  collectCoverageFrom: [
    "shared/**/*.js",
    "modules/**/*.js",
    "middleware/**/*.js",
    "!**/node_modules/**",
    "!**/tests/**",
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  testPathIgnorePatterns: ["/node_modules/"],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: "50%",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
};
