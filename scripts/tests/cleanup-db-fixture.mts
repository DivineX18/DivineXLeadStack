import type { Firestore } from "firebase-admin/firestore";
type Data = Record<string, unknown>;
type Snapshot = {
  exists: boolean;
  id: string;
  ref: Ref;
  data: () => Data | undefined;
};
type QuerySnapshot = { docs: Snapshot[]; size: number; empty: boolean };
interface Ref {
  path: string;
  id: string;
  parent: { path: string; parent: Ref | null };
  collection: (name: string) => Collection;
  get: () => Promise<Snapshot>;
  listCollections: () => Promise<Collection[]>;
}
interface Collection {
  path: string;
  _query: boolean;
  id: string;
  parent: Ref | null;
  doc: (id?: string) => Ref;
  where: (field: string, op: string, value: unknown) => Collection;
  limit: (n: number) => Collection;
  get: () => Promise<QuerySnapshot>;
  listDocuments: () => Promise<Ref[]>;
}
type Write = {
  kind: "delete" | "set" | "update";
  path: string;
  data?: Data;
  merge?: boolean;
};
const millis = (v: unknown) => (v instanceof Date ? v.getTime() : v);
export function cleanupDb() {
  const rows = new Map<string, Data>(),
    deleted: string[] = [],
    queries: { path: string; limit: number }[] = [];
  let sequence = 0,
    tail = Promise.resolve(),
    beforeTx: (() => void) | undefined;
  const snapshot = (path: string) => ({
    exists: rows.has(path),
    id: path.split("/").at(-1)!,
    ref: doc(path),
    data: () => (rows.has(path) ? { ...rows.get(path) } : undefined),
  });
  const directPaths = (path: string) =>
    [...rows.keys()].filter(
      (p) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/")
    );
  function collection(
    path: string,
    group = false,
    filters: [string, string, unknown][] = [],
    limit = Infinity
  ): Collection {
    const q = {
      path,
      _query: true,
      id: path.split("/").at(-1)!,
      parent: group ? null : doc(path.split("/").slice(0, -1).join("/")),
      doc: (id?: string) => doc(path + "/" + (id ?? "auto" + ++sequence)),
      where: (field: string, op: string, value: unknown) =>
        collection(path, group, [...filters, [field, op, value]], limit),
      limit: (n: number) => collection(path, group, filters, n),
      get: async () => {
        queries.push({ path, limit });
        const paths = group
          ? [...rows.keys()].filter((p) => p.split("/").at(-2) === path)
          : directPaths(path);
        const docs = paths
          .filter((p) =>
            filters.every(([f, op, v]) => {
              const a = millis(rows.get(p)?.[f]),
                b = millis(v);
              return op === "=="
                ? a === b
                : op === "<"
                  ? typeof a === "number" && typeof b === "number" && a < b
                  : typeof a === "number" && typeof b === "number" && a > b;
            })
          )
          .slice(0, limit)
          .map(snapshot);
        return { docs, size: docs.length, empty: !docs.length };
      },
      listDocuments: async () =>
        [
          ...new Set(
            [...rows.keys()]
              .filter((p) => p.startsWith(path + "/"))
              .map((p) => p.slice(path.length + 1).split("/")[0])
          ),
        ].map((id) => doc(path + "/" + id)),
    };
    return q;
  }
  function doc(path: string): Ref {
    return {
      path,
      id: path.split("/").at(-1)!,
      parent: {
        path: path.split("/").slice(0, -1).join("/"),
        parent:
          path.split("/").length > 2
            ? doc(path.split("/").slice(0, -2).join("/"))
            : null,
      },
      collection: (name: string) => collection(path + "/" + name),
      get: async () => snapshot(path),
      listCollections: async () =>
        [
          ...new Set(
            [...rows.keys()]
              .filter(
                (p) =>
                  p.startsWith(path + "/") &&
                  p.slice(path.length + 1).includes("/")
              )
              .map((p) => p.slice(path.length + 1).split("/")[0])
          ),
        ].map((name) => collection(path + "/" + name)),
    };
  }
  function commit(writes: Write[]) {
    if (writes.length > 500) throw Error("Firestore write limit exceeded");
    const next = new Map(rows);
    for (const w of writes) {
      if (w.kind === "delete") next.delete(w.path);
      else {
        if (w.kind === "update" && !next.has(w.path))
          throw Error("update missing document");
        next.set(w.path, {
          ...(w.merge || w.kind === "update" ? next.get(w.path) : {}),
          ...w.data,
        });
      }
    }
    for (const w of writes)
      if (
        w.kind === "delete" &&
        w.path.split("/").at(-2) === "webhookEvents" &&
        [...next.keys()].some((p) => p.startsWith(w.path + "/"))
      )
        throw Error("Parent deleted before descendants");
    for (const w of writes)
      if (w.kind === "delete" && rows.has(w.path)) deleted.push(w.path);
    rows.clear();
    for (const [p, d] of next) rows.set(p, d);
  }
  const api = {
    doc,
    collection: (p: string) => collection(p),
    collectionGroup: (p: string) => collection(p, true),
    batch: () => {
      const writes: Write[] = [];
      return {
        delete: (r: { path: string }) =>
          writes.push({ kind: "delete", path: r.path }),
        commit: async () => commit(writes),
      };
    },
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const previous = tail;
      let release = () => {};
      tail = new Promise<void>((r) => {
        release = r;
      });
      await previous;
      try {
        beforeTx?.();
        beforeTx = undefined;
        const writes: Write[] = [];
        const tx = {
          get: async (r: {
            path: string;
            _query?: boolean;
            get: () => Promise<unknown>;
          }) => {
            if (writes.length) throw Error("read after write");
            return r._query ? r.get() : snapshot(r.path);
          },
          getAll: async (...refs: { path: string }[]) => {
            if (writes.length) throw Error("read after write");
            return refs.map((r) => snapshot(r.path));
          },
          delete: (r: { path: string }) =>
            writes.push({ kind: "delete", path: r.path }),
          set: (r: { path: string }, data: Data, opts?: { merge?: boolean }) =>
            writes.push({
              kind: "set",
              path: r.path,
              data,
              merge: opts?.merge,
            }),
          update: (r: { path: string }, data: Data) =>
            writes.push({ kind: "update", path: r.path, data }),
        };
        const result = await fn(tx);
        commit(writes);
        return result;
      } finally {
        release();
      }
    },
  };
  return {
    db: api as unknown as Firestore,
    rows,
    deleted,
    queries,
    onNextTransaction: (f: () => void) => {
      beforeTx = f;
    },
  };
}
