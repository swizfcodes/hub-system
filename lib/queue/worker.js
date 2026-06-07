"use strict";

const { client: redis } = require("../../config/redis");
const logger = require("../../config/logger");

// Simple Redis-backed job queue
// For production scale, replace with BullMQ or similar

const QUEUE_KEY = "hub:jobs:queue";

async function enqueue(jobType, payload) {
  const job = JSON.stringify({
    jobType,
    payload,
    queuedAt: new Date().toISOString(),
  });
  await redis.rPush(QUEUE_KEY, job);
}

async function dequeue() {
  const raw = await redis.lPop(QUEUE_KEY);
  return raw ? JSON.parse(raw) : null;
}

const handlers = {};

function register(jobType, handler) {
  handlers[jobType] = handler;
}

async function processNext() {
  const job = await dequeue();
  if (!job) return;

  const handler = handlers[job.jobType];
  if (!handler) {
    logger.warn(`No handler for job type: ${job.jobType}`);
    return;
  }

  try {
    await handler(job.payload);
    logger.debug(`Queue job processed: ${job.jobType}`);
  } catch (err) {
    logger.error(`Queue job failed: ${job.jobType}`, err);
  }
}

module.exports = { enqueue, register, processNext };
