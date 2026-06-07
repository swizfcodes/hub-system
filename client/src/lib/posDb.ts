/**
 * posDb.ts — IndexedDB wrapper for POS offline mode (via `idb` library).
 *
 * All reads/writes in this file are client-side only.
 * The Zustand store holds the in-memory view; this file persists it.
 *
 * Install: `npm install idb`
 */
import { openDB, IDBPDatabase } from "idb";
import type {
  POSProduct,
  POSCategory,
  PendingTransaction,
  ParkedTransaction,
} from "@typedefs/pos";

// ── Schema ────────────────────────────────────────────────────────────────────

interface POSDBSchema {
  products: { key: string; value: POSProduct };
  categories: { key: string; value: POSCategory };
  stock: {
    key: string;
    value: { product_id: string; qty: number; cached_at: string };
  };
  pending: { key: string; value: PendingTransaction };
  parked: { key: string; value: ParkedTransaction };
}

const DB_NAME = "orika-pos";
const DB_VERSION = 1;

let _db: IDBPDatabase<POSDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<POSDBSchema>> {
  if (_db) return _db;
  _db = await openDB<POSDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("products"))
        db.createObjectStore("products", { keyPath: "product_id" });
      if (!db.objectStoreNames.contains("categories"))
        db.createObjectStore("categories", { keyPath: "category_id" });
      if (!db.objectStoreNames.contains("stock"))
        db.createObjectStore("stock", { keyPath: "product_id" });
      if (!db.objectStoreNames.contains("pending"))
        db.createObjectStore("pending", { keyPath: "offline_id" });
      if (!db.objectStoreNames.contains("parked"))
        db.createObjectStore("parked", { keyPath: "park_id" });
    },
  });
  return _db;
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function cacheProducts(products: POSProduct[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("products", "readwrite");
  const store = tx.objectStore("products");
  await Promise.all(products.map((p) => store.put(p)));
  await tx.done;
}

export async function getCachedProducts(): Promise<POSProduct[]> {
  const db = await getDB();
  return db.getAll("products");
}

export async function getCachedProduct(
  productId: string,
): Promise<POSProduct | undefined> {
  const db = await getDB();
  return db.get("products", productId);
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function cacheCategories(
  categories: POSCategory[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("categories", "readwrite");
  const store = tx.objectStore("categories");
  await Promise.all(categories.map((c) => store.put(c)));
  await tx.done;
}

export async function getCachedCategories(): Promise<POSCategory[]> {
  const db = await getDB();
  return db.getAll("categories");
}

// ── Stock ─────────────────────────────────────────────────────────────────────

export async function cacheStockQty(
  productId: string,
  qty: number,
): Promise<void> {
  const db = await getDB();
  await db.put("stock", {
    product_id: productId,
    qty,
    cached_at: new Date().toISOString(),
  });
}

export async function bulkCacheStock(
  items: Array<{ product_id: string; available_qty: number }>,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("stock", "readwrite");
  const store = tx.objectStore("stock");
  await Promise.all(
    items.map((item) =>
      store.put({
        product_id: item.product_id,
        qty: item.available_qty,
        cached_at: new Date().toISOString(),
      }),
    ),
  );
  await tx.done;
}

/** Decrement stock optimistically when a product is sold offline. */
export async function decrementStock(
  productId: string,
  qty: number,
): Promise<void> {
  const db = await getDB();
  const current = await db.get("stock", productId);
  if (!current) return;
  await db.put("stock", {
    ...current,
    qty: Math.max(0, current.qty - qty),
  });
}

/** Increment stock when a transaction is voided offline. */
export async function incrementStock(
  productId: string,
  qty: number,
): Promise<void> {
  const db = await getDB();
  const current = await db.get("stock", productId);
  if (!current) return;
  await db.put("stock", { ...current, qty: current.qty + qty });
}

export async function getStockQty(productId: string): Promise<number> {
  const db = await getDB();
  const row = await db.get("stock", productId);
  return row?.qty ?? 0;
}

/** H4 fix: batch-read all stock quantities in a single IDB transaction */
export async function getAllStockQty(): Promise<Map<string, number>> {
  const db = await getDB();
  const all = await db.getAll("stock");
  const map = new Map<string, number>();
  for (const row of all) {
    map.set(row.product_id, row.qty);
  }
  return map;
}

// ── Pending transactions (offline sync queue) ─────────────────────────────────

export async function addPendingTransaction(
  tx: PendingTransaction,
): Promise<void> {
  const db = await getDB();
  await db.put("pending", tx);
}

export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  const db = await getDB();
  const all = await db.getAll("pending");
  return all.filter(
    (t) => t.sync_status === "pending" || t.sync_status === "conflict",
  );
}

export async function getPendingCount(): Promise<number> {
  // M3 fix: use IDB count() instead of getAll + filter
  const db = await getDB();
  // IDB count() on the store counts all records. Since we can't filter with
  // count() without an index, we add a quick cursor count for 'pending' status.
  // Still much cheaper than deserializing all records.
  const tx = db.transaction("pending", "readonly");
  const store = tx.objectStore("pending");
  let count = 0;
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.value.sync_status === "pending") count++;
    cursor = await cursor.continue();
  }
  return count;
}

export async function markTransactionSyncing(offlineId: string): Promise<void> {
  const db = await getDB();
  const tx = await db.get("pending", offlineId);
  if (tx) await db.put("pending", { ...tx, sync_status: "syncing" });
}

export async function markTransactionSynced(offlineId: string): Promise<void> {
  const db = await getDB();
  const tx = await db.get("pending", offlineId);
  if (tx) await db.put("pending", { ...tx, sync_status: "synced" });
}

export async function markTransactionConflict(
  offlineId: string,
  conflictType: PendingTransaction["conflict_type"],
  message: string,
): Promise<void> {
  const db = await getDB();
  const tx = await db.get("pending", offlineId);
  if (tx) {
    await db.put("pending", {
      ...tx,
      sync_status: "conflict",
      conflict_type: conflictType,
      conflict_message: message,
    });
  }
}

export async function getAllPendingTransactions(): Promise<
  PendingTransaction[]
> {
  const db = await getDB();
  return db.getAll("pending");
}

// ── Parked transactions ───────────────────────────────────────────────────────

export async function saveParkedTransaction(
  parked: ParkedTransaction,
): Promise<void> {
  const db = await getDB();
  await db.put("parked", parked);
}

export async function getParkedTransactions(): Promise<ParkedTransaction[]> {
  const db = await getDB();
  return db.getAll("parked");
}

export async function removeParkedTransaction(parkId: string): Promise<void> {
  const db = await getDB();
  await db.delete("parked", parkId);
}

// ── Clear (on session end) ────────────────────────────────────────────────────

/** Clears products, categories, and stock cache. Call when session closes. */
export async function clearSessionCache(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear("products"),
    db.clear("categories"),
    db.clear("stock"),
  ]);
}

/** Clears only successfully synced pending transactions. */
export async function clearSyncedTransactions(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll("pending");
  const done = all.filter((t) => t.sync_status === "synced");
  const tx = db.transaction("pending", "readwrite");
  await Promise.all(
    done.map((t) => tx.objectStore("pending").delete(t.offline_id)),
  );
  await tx.done;
}
