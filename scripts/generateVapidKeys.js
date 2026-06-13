"use strict";

// One-time VAPID key pair generator for Web Push.
//   node scripts/generateVapidKeys.js
// Paste the output into your .env — keep the private key secret. Push
// notifications stay disabled until both keys are set.

const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();
console.log("Add these to your .env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:admin@yourbrand.com");
