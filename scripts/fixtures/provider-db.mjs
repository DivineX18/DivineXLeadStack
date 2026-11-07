// Transactional in-memory boundary for disconnected provider tests.
export function fakeDb() {
  const rows = new Map();
  let seq = 0,
    tail = Promise.resolve();
  const failures = [];
  const snap = (ref) => ({
    exists: rows.has(ref.path),
    id: ref.id,
    ref,
    data: () => rows.get(ref.path),
  });
  const transform = (v, old) =>
    v?.op === "increment"
      ? (old ?? 0) + v.n
      : v?.op === "union"
        ? [...new Set([...(old ?? []), ...v.v])]
        : v?.op === "stamp"
          ? new Date()
          : v;
  const apply = (ref, data, opts) => {
    const old = rows.get(ref.path) ?? {};
    const out = opts?.merge ? { ...old } : {};
    for (const [k, v] of Object.entries(data)) out[k] = transform(v, old[k]);
    rows.set(ref.path, out);
  };
  const ref = (path) => ({
    path,
    id: path.split("/").at(-1),
    collection: (n) => query(path + "/" + n),
    get: async () => snap(ref(path)),
    create: async data => {if(rows.has(path))throw new Error("exists");apply(ref(path),data);},
    delete: async () => rows.delete(path),
    set: async (data, opts) => {
      maybeFail(path);
      apply(ref(path), data, opts);
    },
    update: async (data) => {
      maybeFail(path);
      apply(ref(path), data, { merge: true });
    },
  });
  const query = (path) => {
    const filters = [];
    const q = {
      doc: (id) => ref(path + "/" + (id ?? "auto" + ++seq)),
      where: (k, op, v) => {
        filters.push([k, v]);
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        const docs = [...rows.keys()]
          .filter(
            (k) =>
              k.startsWith(path + "/") &&
              !k.slice(path.length + 1).includes("/")
          )
          .map(ref)
          .filter((r) =>
            filters.every(
              ([k, v]) =>
                k.split(".").reduce((o, p) => o?.[p], rows.get(r.path)) === v
            )
          )
          .map(snap);
        return { docs, empty: !docs.length, size:docs.length };
      },
      add: async (data) => {
        const r = q.doc();
        await r.set(data);
        return r;
      },
    };
    return q;
  };
  function maybeFail(path) {
    const i = failures.findIndex((x) => x(path));
    if (i >= 0) {
      failures.splice(i, 1);
      throw new Error("injected database failure");
    }
  }
  const db = {
    rows,
    failures,
    doc: ref,
    collection: query,
    runTransaction: async (fn) => {
      const before = tail;
      let unlock;
      tail = new Promise((r) => (unlock = r));
      await before;
      try {
        const writes = [];
        const tx = {
          get: async (r) => snap(r),
          set: (...a) => writes.push(a),
          update: (r, d) => writes.push([r, d, { merge: true }]),
        };
        const value = await fn(tx);
        for (const [r] of writes) maybeFail(r.path);
        for (const a of writes) apply(...a);
        return value;
      } finally {
        unlock();
      }
    },
  };
  db.batch = () => {
    const writes = [];
    return {
      set: (...a) => writes.push(a),
      update: (r,d) => writes.push([r,d,{merge:true}]),
      commit: async () => {
        for (const [r] of writes) maybeFail(r.path);
        for (const a of writes) apply(...a);
      },
    };
  };
  return db;
}
