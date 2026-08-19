import type { PrdRow } from "./types";

type StoredPreview = {
  rows: PrdRow[];
  filename: string;
  newBatch: number;
  updatedBatch: number;
  createdAt: number;
};

const store = new Map<string, StoredPreview>();
const TTL_MS = 30 * 60 * 1000;

export function setPreview(id: string, data: StoredPreview): void {
  prune();
  store.set(id, data);
}

export function getPreview(id: string): StoredPreview | null {
  const item = store.get(id);
  if (!item) return null;
  if (Date.now() - item.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return item;
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k);
  }
}