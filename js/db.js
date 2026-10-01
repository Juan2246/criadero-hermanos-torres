const DB = (() => {
  const DB_NAME = "gallosTorresDB";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("ejemplares")) {
          const store = db.createObjectStore("ejemplares", { keyPath: "id" });
          store.createIndex("placa", "placa", { unique: true });
          store.createIndex("padreId", "padreId", { unique: false });
          store.createIndex("madreId", "madreId", { unique: false });
        }
        if (!db.objectStoreNames.contains("pendientes")) {
          db.createObjectStore("pendientes", { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function tx(storeName, mode) {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function getAllEjemplares() {
    const store = await tx("ejemplares", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getEjemplar(id) {
    const store = await tx("ejemplares", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function findByPlaca(placa) {
    const store = await tx("ejemplares", "readonly");
    return new Promise((resolve, reject) => {
      const idx = store.index("placa");
      const req = idx.get(placa);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveEjemplar(ejemplar) {
    if (!ejemplar.id) ejemplar.id = uuid();
    if (!ejemplar.createdAt) ejemplar.createdAt = new Date().toISOString();
    const existing = await findByPlaca(ejemplar.placa);
    if (existing && existing.id !== ejemplar.id) {
      throw new Error("PLACA_DUPLICADA");
    }
    const store = await tx("ejemplares", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(ejemplar);
      req.onsuccess = () => resolve(ejemplar);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteEjemplar(id) {
    const store = await tx("ejemplares", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function getHijos(id) {
    const all = await getAllEjemplares();
    return all.filter((e) => e.padreId === id || e.madreId === id);
  }

  async function getAllPendientes() {
    const store = await tx("pendientes", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function savePendiente(p) {
    if (!p.id) p.id = uuid();
    if (!p.createdAt) p.createdAt = new Date().toISOString();
    const store = await tx("pendientes", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(p);
      req.onsuccess = () => resolve(p);
      req.onerror = () => reject(req.error);
    });
  }

  async function deletePendiente(id) {
    const store = await tx("pendientes", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function exportAll() {
    const ejemplares = await getAllEjemplares();
    const pendientes = await getAllPendientes();
    return {
      exportedAt: new Date().toISOString(),
      version: DB_VERSION,
      ejemplares,
      pendientes,
    };
  }

  // Todo en UNA transacción: si cualquier registro falla (placa repetida,
  // dato corrupto), IndexedDB deshace también el borrado y los datos que
  // había en el celular quedan intactos.
  async function importAll(data, mode) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(["ejemplares", "pendientes"], "readwrite");
      const storeE = t.objectStore("ejemplares");
      const storeP = t.objectStore("pendientes");
      if (mode === "reemplazar") {
        storeE.clear();
        storeP.clear();
      }
      (data.ejemplares || []).forEach((e) => storeE.put(e));
      (data.pendientes || []).forEach((p) => storeP.put(p));
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error || new Error("IMPORT_ABORTADO"));
    });
  }

  return {
    uuid,
    getAllEjemplares,
    getEjemplar,
    findByPlaca,
    saveEjemplar,
    deleteEjemplar,
    getHijos,
    getAllPendientes,
    savePendiente,
    deletePendiente,
    exportAll,
    importAll,
  };
})();
