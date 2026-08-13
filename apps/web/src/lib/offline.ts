export const OFFLINE_STATE_EVENT = "fleetos:offline-state";

const DB_NAME = "fleetos-resilience";
const DB_VERSION = 1;
const CACHE_STORE = "responses";
const QUEUE_STORE = "mutations";
const LAST_SYNC_KEY = "fleetos.lastOfflineSyncAt";

export type OfflineMutation = {
  id: string;
  authUserId: string;
  workspaceId: string;
  path: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  createdAt: string;
  attempts: number;
  state: "pending" | "failed";
  lastError: string | null;
};

type CachedResponse = {
  key: string;
  workspaceId: string;
  path: string;
  payload: unknown;
  storedAt: string;
};

export type OfflineSnapshot = {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
};

type SyncResult = { ok: boolean; status: number; payload: unknown };

let databasePromise: Promise<IDBDatabase> | null = null;
let syncing = false;

function database() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support secure offline storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        queue.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return databasePromise;
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
  });
}

async function storeRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return requestValue(action(db.transaction(storeName, mode).objectStore(storeName)));
}

function cacheKey(workspaceId: string, path: string) {
  return `${workspaceId}:${path}`;
}

async function allMutations() {
  return storeRequest(QUEUE_STORE, "readonly", (store) => store.getAll()) as Promise<OfflineMutation[]>;
}

async function publishState() {
  const snapshot = await getOfflineSnapshot();
  window.dispatchEvent(new CustomEvent(OFFLINE_STATE_EVENT, { detail: snapshot }));
  return snapshot;
}

export function isQueueableMutation(path: string, method: string) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  return [
    "/vehicles",
    "/drivers",
    "/jobs",
    "/operations/defects",
    "/operations/driver-hours",
    "/operations/maintenance",
    "/registers",
    "/messages",
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function cacheApiResponse(workspaceId: string, path: string, payload: unknown) {
  if (!workspaceId) return;
  const record: CachedResponse = { key: cacheKey(workspaceId, path), workspaceId, path, payload, storedAt: new Date().toISOString() };
  await storeRequest(CACHE_STORE, "readwrite", (store) => store.put(record));
}

export async function getCachedApiResponse<T>(workspaceId: string, path: string): Promise<T | null> {
  if (!workspaceId) return null;
  const record = await storeRequest(CACHE_STORE, "readonly", (store) => store.get(cacheKey(workspaceId, path))) as CachedResponse | undefined;
  return (record?.payload ?? null) as T | null;
}

function parseBody(body: string | null) {
  if (!body) return {};
  try { return JSON.parse(body) as Record<string, unknown>; }
  catch { return {}; }
}

function optimisticRecord(item: OfflineMutation) {
  const now = item.createdAt;
  return {
    ...parseBody(item.body),
    id: `offline:${item.id}`,
    createdAt: now,
    updatedAt: now,
    queued: true,
    offline: true,
    clientMutationId: item.id,
  };
}

function replaceById(items: unknown[], id: string, patch: Record<string, unknown>, remove: boolean) {
  if (remove) return items.filter((value) => !(value && typeof value === "object" && (value as { id?: unknown }).id === id));
  return items.map((value) => value && typeof value === "object" && (value as { id?: unknown }).id === id ? { ...value, ...patch, updatedAt: new Date().toISOString() } : value);
}

async function updateOptimisticCache(item: OfflineMutation) {
  const segments = item.path.split("/").filter(Boolean);
  const targetId = segments.at(-1) ?? "";
  const body = parseBody(item.body);
  let collectionPath = item.path;
  if (["PATCH", "PUT", "DELETE"].includes(item.method)) collectionPath = `/${segments.slice(0, -1).join("/")}`;

  if (item.path.startsWith("/operations/maintenance/")) collectionPath = "/operations/maintenance";
  if (item.path.startsWith("/messages/") && segments.length === 2 && item.method === "POST") collectionPath = item.path;

  const existing = await getCachedApiResponse<unknown>(item.workspaceId, collectionPath);
  if (!existing) return;

  if (Array.isArray(existing)) {
    const updated = item.method === "POST"
      ? [...existing, optimisticRecord(item)]
      : replaceById(existing, targetId, body, item.method === "DELETE");
    await cacheApiResponse(item.workspaceId, collectionPath, updated);
    return;
  }

  if (!existing || typeof existing !== "object") return;
  const record = { ...(existing as Record<string, unknown>) };
  if (collectionPath === "/operations/maintenance") {
    const key = item.path.includes("/plans") ? "plans" : "workOrders";
    const values = Array.isArray(record[key]) ? record[key] as unknown[] : [];
    record[key] = item.method === "POST" ? [...values, optimisticRecord(item)] : replaceById(values, targetId, body, item.method === "DELETE");
  } else if (item.path.startsWith("/messages/") && Array.isArray(record.messages)) {
    record.messages = [...record.messages, optimisticRecord(item)];
  } else {
    return;
  }
  await cacheApiResponse(item.workspaceId, collectionPath, record);
}

async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const withSync = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
    await withSync.sync?.register("fleetos-offline-sync");
  } catch {
    // Browsers without Background Sync still retry on the online event and timer.
  }
}

export async function queueOfflineMutation(input: Omit<OfflineMutation, "id" | "createdAt" | "attempts" | "state" | "lastError">) {
  const item: OfflineMutation = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: "pending",
    lastError: null,
  };
  await storeRequest(QUEUE_STORE, "readwrite", (store) => store.put(item));
  await updateOptimisticCache(item);
  await requestBackgroundSync();
  await publishState();
  return optimisticRecord(item);
}

export async function getOfflineSnapshot(): Promise<OfflineSnapshot> {
  let items: OfflineMutation[] = [];
  try { items = await allMutations(); } catch { /* IndexedDB may be unavailable in privacy mode. */ }
  return {
    online: navigator.onLine,
    syncing,
    pending: items.filter((item) => item.state === "pending").length,
    failed: items.filter((item) => item.state === "failed").length,
    lastSyncedAt: localStorage.getItem(LAST_SYNC_KEY),
  };
}

export async function listOfflineMutations() {
  return (await allMutations()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function discardOfflineMutation(id: string) {
  await storeRequest(QUEUE_STORE, "readwrite", (store) => store.delete(id));
  await publishState();
}

export async function retryOfflineMutation(id: string) {
  const item = await storeRequest(QUEUE_STORE, "readonly", (store) => store.get(id)) as OfflineMutation | undefined;
  if (!item) return;
  await storeRequest(QUEUE_STORE, "readwrite", (store) => store.put({ ...item, state: "pending", lastError: null }));
  await publishState();
}

export async function clearOfflineData() {
  await Promise.all([
    storeRequest(CACHE_STORE, "readwrite", (store) => store.clear()),
    storeRequest(QUEUE_STORE, "readwrite", (store) => store.clear()),
  ]);
  localStorage.removeItem(LAST_SYNC_KEY);
  await publishState();
}

export async function syncOfflineMutations(authUserId: string, execute: (item: OfflineMutation) => Promise<SyncResult>) {
  if (syncing || !navigator.onLine) return getOfflineSnapshot();
  syncing = true;
  await publishState();
  try {
    const items = (await listOfflineMutations()).filter((item) => item.authUserId === authUserId && item.state === "pending");
    for (const item of items) {
      try {
        const result = await execute(item);
        if (result.ok) {
          await storeRequest(QUEUE_STORE, "readwrite", (store) => store.delete(item.id));
          continue;
        }
        const payload = result.payload && typeof result.payload === "object" ? result.payload as { error?: string; code?: string } : {};
        const processing = result.status === 409 && payload.code === "IDEMPOTENCY_IN_PROGRESS";
        const retryable = processing || result.status === 401 || result.status === 429 || result.status >= 500;
        const updated: OfflineMutation = {
          ...item,
          attempts: item.attempts + 1,
          state: retryable ? "pending" : "failed",
          lastError: payload.error ?? `Sync returned ${result.status}`,
        };
        await storeRequest(QUEUE_STORE, "readwrite", (store) => store.put(updated));
        if (result.status === 401) break;
      } catch (error) {
        const updated: OfflineMutation = {
          ...item,
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : "Connection lost during sync.",
        };
        await storeRequest(QUEUE_STORE, "readwrite", (store) => store.put(updated));
        break;
      }
    }
    if ((await allMutations()).every((item) => item.state !== "pending" || item.authUserId !== authUserId)) {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }
  } finally {
    syncing = false;
    await publishState();
  }
  return getOfflineSnapshot();
}

