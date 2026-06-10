require("dotenv").config();
const { Client } = require("pg");
const c = new Client({
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432"),
  database: process.env.PG_DATABASE || "hubdata",
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});
(async () => {
  await c.connect();
  for (const q of [
    `SELECT CASE WHEN sku LIKE 'ORIKA-SE-%' OR sku LIKE 'ORIKA-GE-%' OR sku LIKE 'ORIKA-CD-%' OR sku='ORIKA-GS-TRIO-250' THEN 'NEW' ELSE 'OLD/other' END AS bucket, is_deleted, is_active, count(*)::int AS n FROM diffusers.products GROUP BY 1,2,3 ORDER BY 1,2,3`,
    `SELECT sku, name, is_active, is_deleted FROM diffusers.products WHERE is_deleted=false AND is_active=true ORDER BY sku`,
    `SELECT count(*)::int AS store_listings FROM store.products`,
  ]) {
    const r = await c.query(q);
    console.table(r.rows);
  }
  await c.end();
})();