"use strict";

require("dotenv").config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env"
      : process.env.NODE_ENV === "staging"
        ? ".env.staging"
        : ".env.local",
});

// OnePipe accepts exactly "Live" or "Inspect" for transaction.mock_mode and
// rejects anything else (or a value that doesn't match the app's mode on the
// Optimus dashboard) with "Request mode not supported". Normalize case and
// whitespace, and fall back to "Live" so a stale env value can never take
// checkout down.
function normalizeOptimusMockMode(raw) {
  const mode = { live: "Live", inspect: "Inspect" }[
    String(raw || "Live").trim().toLowerCase()
  ];
  if (!mode) {
    console.warn(
      `[config] OPTIMUS_PAY_MOCK_MODE="${raw}" is not a valid OnePipe request mode (Live | Inspect) — using "Live"`,
    );
    return "Live";
  }
  return mode;
}

const config = {
  // Fixed UUID used as posted_by for machine-generated journal entries
  // (e.g. payment-gateway webhooks). Must exist in shared.users — seeded by
  // migration 000029_accounting_expansion.sql.
  systemUserId:
    process.env.SYSTEM_USER_ID || "00000000-0000-0000-0000-000000000001",
  app: {
    env: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT || "3000"),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: process.env.JWT_EXPIRY || "24h",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
    // Public base URL of the Hub frontend — used in invite/onboarding links.
    hubBaseUrl:
      process.env.HUB_BASE_URL ||
      process.env.BASE_URL ||
      (process.env.ALLOWED_ORIGINS || "http://localhost:7000").split(",")[0],
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS || "http://localhost:7000"
    ).split(","),
    // FALLBACK ONLY — the canonical active-business list is loaded
    // dynamically from shared.business_config at startup by
    // config/businesses.js. This array is only used:
    //   (a) by scripts/migrations that run before the DB has business_config seeded
    //   (b) as a degraded-mode fallback if the DB is unreachable at boot
    // Adding a new business does NOT require editing this list —
    // use POST /settings/businesses (with provision_schema: true) or
    // scripts/bootstrapBusiness.js instead.
    businesses: ["jewelry", "diffusers"],
  },

  pg: {
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
    pool: {
      max: parseInt(process.env.PG_POOL_MAX || "20"),
      min: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    },
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || "local", // 'local' | 's3'
    localPath: process.env.STORAGE_LOCAL_PATH || "./uploads",
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION || "eu-west-1",
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
    baseUrl: "https://api.paystack.co",
  },

  optimusPay: {
    // Trimmed because the Signature header is MD5(request_ref;client_secret)
    // — one invisible trailing space pasted into .env breaks every call
    // with a 401 and no useful message.
    apiKey: (process.env.OPTIMUS_PAY_API_KEY || "").trim(),
    clientSecret: (process.env.OPTIMUS_PAY_CLIENT_SECRET || "").trim(),
    // Name registered on provisioned virtual accounts (what a payer sees on
    // name-enquiry before transferring). Defaults to the customer's name
    // per-order when unset; set a business name to brand the account.
    accountName: process.env.OPTIMUS_PAY_ACCOUNT_NAME,
    // transaction.mock_mode — must match the app's mode on the Optimus
    // dashboard. Only "Live" or "Inspect" exist; anything else is rejected
    // by the API with "Request mode not supported".
    mockMode: normalizeOptimusMockMode(process.env.OPTIMUS_PAY_MOCK_MODE),
    // Live OnePipe endpoint by default — deliberately NOT keyed on NODE_ENV,
    // so a PM2 started without `--env production` can't silently re-route
    // payments to a dead mock. Set OPTIMUS_PAY_BASE_URL only to point local
    // dev at scripts/optimus-mock-server.js; leave it unset in production.
    baseUrl: (process.env.OPTIMUS_PAY_BASE_URL || "https://api.onepipe.io")
      .trim()
      .replace(/\/+$/, ""),
    notificationUrl:
      process.env.OPTIMUS_PAY_NOTIFICATION_URL ||
      `${process.env.HUB_BASE_URL || "http://localhost:7000"}/api/webhooks/optimus`,
    // Webhook authenticity: Transaction Notifications carry no verifiable
    // signature (pending confirmation from Optimus IT) and our transaction
    // refs are guessable (store-{id}, inv-{id}), so by default the webhook
    // re-queries /v2/transact/query server-to-server before fulfilling
    // anything. Set OPTIMUS_PAY_WEBHOOK_VERIFY=off ONLY for mock testing.
    verifyWebhookViaQuery: process.env.OPTIMUS_PAY_WEBHOOK_VERIFY !== "off",
  },

  flutterwave: {
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
    baseUrl: "https://api.flutterwave.com/v3",
  },

  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    storeUrl: process.env.SHOPIFY_STORE_URL,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  },

  woocommerce: {
    siteUrl: process.env.WC_SITE_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    webhookSecret: process.env.WC_WEBHOOK_SECRET,
  },

  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    accessToken: process.env.META_ACCESS_TOKEN,
    verifyToken: process.env.META_VERIFY_TOKEN, // for webhook verification
    igBusinessId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    fbPageId: process.env.FACEBOOK_PAGE_ID,
  },

  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    accessToken: process.env.TIKTOK_ACCESS_TOKEN,
  },

  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
  },

  whatsapp: {
    apiToken: process.env.WHATSAPP_API_TOKEN,
    // Legacy single phone-number id — kept for backward compatibility with
    // single-brand callers. Multi-brand callers should use phoneNumbers.
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    phoneNumbers: {
      jewelry:
        process.env.WHATSAPP_PHONE_ID_JEWELRY ||
        process.env.WHATSAPP_PHONE_NUMBER_ID,
      diffusers:
        process.env.WHATSAPP_PHONE_ID_DIFFUSERS ||
        process.env.WHATSAPP_PHONE_NUMBER_ID,
    },
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    baseUrl: "https://graph.facebook.com/v18.0",
  },

  chowdeck: {
    apiKey: process.env.CHOWDECK_API_KEY,
    baseUrl: process.env.CHOWDECK_BASE_URL || "https://api.chowdeck.com",
  },

  gigl: {
    clientId: process.env.GIGL_CLIENT_ID,
    clientSecret: process.env.GIGL_CLIENT_SECRET,
    baseUrl: process.env.GIGL_BASE_URL || "https://api.gigl.com",
  },

  push: {
    // Web Push (VAPID). Generate a key pair once with
    //   node scripts/generateVapidKeys.js
    // and set the env vars — push stays silently disabled until then.
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
    vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@orikahub.com",
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName: process.env.SMTP_FROM_NAME || "Hub Platform",
    fromEmail: process.env.SMTP_FROM_EMAIL,
    // Per-brand sender overrides — mirrors the WhatsApp phoneNumbers pattern.
    // Falls back to the shared fromName / fromEmail above if a brand key is
    // missing or empty.
    brands: {
      jewelry: {
        fromName: process.env.SMTP_FROM_NAME_JEWELRY || null,
        fromEmail:
          process.env.SMTP_FROM_EMAIL_JEWELRY || process.env.SMTP_FROM_EMAIL,
      },
      diffusers: {
        fromName: process.env.SMTP_FROM_NAME_DIFFUSERS || null,
        fromEmail:
          process.env.SMTP_FROM_EMAIL_DIFFUSERS || process.env.SMTP_FROM_EMAIL,
      },
    },
  },
};

// Validate critical config at startup
const required = ["pg.password", "app.jwtSecret", "app.refreshSecret"];
for (const key of required) {
  const val = key.split(".").reduce((o, k) => o?.[k], config);
  if (!val) {
    console.error(`FATAL: Missing required config: ${key}`);
    process.exit(1);
  }
}

module.exports = config;
