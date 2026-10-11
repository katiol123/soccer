/* Хранилище сохранений: IndexedDB + сжатие gzip, перенос старых сохранений из localStorage,
   экспорт/импорт в файл. Если IndexedDB недоступен — запасной вариант через localStorage. */
(function (G) {
  'use strict';
  const DB_NAME = 'kombinaciya', STORE = 'saves', KEY = 'main', LEGACY_KEY = 'match3-manager-save-v1';
  const hasIDB = typeof indexedDB !== 'undefined';
  const hasGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

  let dbp = null;
  function db() {
    if (!hasIDB) return Promise.resolve(null);
    if (!dbp) {
      dbp = new Promise(res => {
        try {
          const rq = indexedDB.open(DB_NAME, 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
          rq.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
    }
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(d => d ? new Promise(res => {
      try {
        const tx = d.transaction(STORE, mode), s = tx.objectStore(STORE);
        const rq = fn(s);
        tx.oncomplete = () => res(rq ? rq.result : true);
        tx.onerror = tx.onabort = () => res(undefined);
      } catch (e) { res(undefined); }
    }) : undefined);
  }

  async function gzip(str) {
    if (!hasGzip) return { z: false, data: str };
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    return { z: true, data: await new Response(stream).arrayBuffer() };
  }
  async function gunzip(rec) {
    if (!rec) return null;
    if (!rec.z) return rec.data;
    const stream = new Blob([rec.data]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  const meta = { raw: 0, stored: 0, backend: hasIDB ? 'IndexedDB' : 'localStorage', at: null };

  /* Сохранение с объединением частых вызовов: пишется только последнее состояние */
  let pending = null, writing = null;
  function save(json) {
    pending = json;
    if (!writing) writing = flush();
    return writing;
  }
  async function flush() {
    while (pending) {
      const json = pending; pending = null;
      const rec = await gzip(json);
      rec.v = 2; rec.at = Date.now();
      const ok = await idb('readwrite', s => s.put(rec, KEY));
      if (ok === undefined) {
        try { localStorage.setItem(LEGACY_KEY, json); meta.backend = 'localStorage'; } catch (e) { /* место закончилось */ }
      } else {
        meta.backend = 'IndexedDB';
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* */ }
      }
      meta.raw = json.length; meta.stored = rec.z ? rec.data.byteLength : json.length; meta.at = rec.at;
    }
    writing = null;
    return true;
  }

  /* Загрузка: сначала IndexedDB, затем старое сохранение из localStorage (будет перенесено при следующей записи) */
  async function load() {
    if (writing) await writing;
    const rec = await idb('readonly', s => s.get(KEY));
    if (rec) {
      const json = await gunzip(rec);
      meta.raw = json.length; meta.stored = rec.z ? rec.data.byteLength : json.length; meta.at = rec.at;
      return json;
    }
    try { return localStorage.getItem(LEGACY_KEY); } catch (e) { return null; }
  }
  async function has() {
    const rec = await idb('readonly', s => s.count(KEY));
    if (rec) return true;
    try { return !!localStorage.getItem(LEGACY_KEY); } catch (e) { return false; }
  }
  async function clear() {
    await idb('readwrite', s => s.delete(KEY));
    try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* */ }
  }

  /* Экспорт в файл (.json.gz или .json) */
  async function exportFile(json, name) {
    const rec = await gzip(json);
    const blob = new Blob([rec.data], { type: rec.z ? 'application/gzip' : 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name || 'kombinaciya') + (rec.z ? '.json.gz' : '.json');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importFile(file) {
    const buf = await file.arrayBuffer();
    const b = new Uint8Array(buf);
    const isGz = b[0] === 0x1f && b[1] === 0x8b;
    if (isGz && !hasGzip) throw new Error('Браузер не умеет распаковывать gzip');
    return isGz ? await gunzip({ z: true, data: buf }) : new TextDecoder().decode(buf);
  }

  G.STORE = { save, load, has, clear, exportFile, importFile, meta, hasGzip, hasIDB };
})(typeof window !== 'undefined' ? window : globalThis);
