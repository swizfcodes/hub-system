/**
 * Jest Setup File
 * Configures test environment before tests run
 */

// Set test environment variables
// Must cover ALL keys in config/config.js's `required` array:
//   ["pg.password", "app.jwtSecret", "app.refreshSecret"]
// Without these, config.js calls process.exit(1) and kills the test runner.
process.env.NODE_ENV = "test";

// JWT
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-key-for-testing-only-min-64-chars-xxxxxxxxxxxxxxxx";
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY || "1h";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret-for-testing-only-min-64-chars-xxxxxxxxxxxxxxx";
process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

// PostgreSQL — real values required for integration tests; stubs prevent
// config.js from calling process.exit(1) in unit tests that mock the DB.
process.env.PG_HOST     = process.env.PG_HOST     || "localhost";
process.env.PG_PORT     = process.env.PG_PORT     || "5432";
process.env.PG_DATABASE = process.env.PG_DATABASE || "hub_db_test";
process.env.PG_USER     = process.env.PG_USER     || "hub_app";
process.env.PG_PASSWORD = process.env.PG_PASSWORD || "test-pg-password-stub";

// Redis
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// App
process.env.PORT            = process.env.PORT || "3001";
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "http://localhost:3001";

// Suppress console output in tests unless explicitly needed
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Restore for debugging if needed
if (process.env.DEBUG) {
  global.console.log = originalLog;
  global.console.error = originalError;
  global.console.warn = originalWarn;
}

// Extend Jest matchers if needed
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },

  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false,
      };
    }
  },
});
