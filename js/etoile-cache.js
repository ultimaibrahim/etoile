/**
 * js/etoile-cache.js — Zenith Core: Motor de Almacenamiento Reactivo con IndexedDB
 * Proporciona persistencia ultra-rápida (<5ms) para el patrón Stale-While-Revalidate (SWR),
 * soporte offline completo y fallback transparente a memoria volátil en navegación privada.
 */

const EtoileCache = (function() {
  'use strict';

  const DB_NAME = 'etoile_zenith_db_v2';   // v2: las 1–2★ sin texto ya no se guardan (la base v1 las contenía)
  const DB_VERSION = 1;
  const STORES = ['reviews_cache', 'manifest_cache', 'stats_cache'];

  let dbInstance = null;
  let isIndexedDBAvailable = false;
  const memoryFallback = {
    reviews_cache: new Map(),
    manifest_cache: new Map(),
    stats_cache: new Map()
  };

  // Limpieza única de la base anterior (guardaba reseñas de 1–2★ sin texto, ya descartadas)
  try { if (typeof window !== 'undefined' && window.indexedDB) window.indexedDB.deleteDatabase('etoile_zenith_db'); } catch (e) { /* sin IndexedDB */ }

  /**
   * Comprueba la disponibilidad de IndexedDB en el entorno actual
   */
  function checkAvailability() {
    try {
      return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  /**
   * Inicializa la conexión con IndexedDB o configura el fallback en memoria
   */
  function init() {
    return new Promise((resolve) => {
      if (!checkAvailability()) {
        console.warn('[EtoileCache] IndexedDB no disponible. Activando fallback en memoria.');
        isIndexedDBAvailable = false;
        resolve(false);
        return;
      }

      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function(event) {
          const db = event.target.result;
          STORES.forEach(storeName => {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'key' });
            }
          });
        };

        request.onsuccess = function(event) {
          dbInstance = event.target.result;
          isIndexedDBAvailable = true;
          resolve(true);
        };

        request.onerror = function(event) {
          console.warn('[EtoileCache] Error abriendo IndexedDB:', event.target.error);
          isIndexedDBAvailable = false;
          resolve(false);
        };
      } catch (err) {
        console.warn('[EtoileCache] Excepción en init:', err);
        isIndexedDBAvailable = false;
        resolve(false);
      }
    });
  }

  /**
   * Recupera un registro por clave desde un Object Store específico
   * @param {string} storeName - 'reviews_cache' | 'manifest_cache' | 'stats_cache'
   * @param {string} key - Identificador único del registro
   * @returns {Promise<any|null>}
   */
  function get(storeName, key) {
    return new Promise((resolve) => {
      if (!isIndexedDBAvailable || !dbInstance) {
        const store = memoryFallback[storeName];
        resolve(store ? store.get(key) || null : null);
        return;
      }

      try {
        const tx = dbInstance.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = function() {
          if (request.result && request.result.data !== undefined) {
            resolve(request.result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = function() {
          resolve(null);
        };
      } catch (err) {
        console.warn(`[EtoileCache] Error al leer clave '${key}' de '${storeName}':`, err);
        resolve(null);
      }
    });
  }

  /**
   * Almacena o actualiza un registro en el Object Store especificado
   * @param {string} storeName - 'reviews_cache' | 'manifest_cache' | 'stats_cache'
   * @param {string} key - Identificador único
   * @param {any} data - Carga útil a persistir
   * @returns {Promise<boolean>}
   */
  function set(storeName, key, data) {
    return new Promise((resolve) => {
      // Guardar siempre en memoria para acceso síncrono ultra-rápido
      if (memoryFallback[storeName]) {
        memoryFallback[storeName].set(key, data);
      }

      if (!isIndexedDBAvailable || !dbInstance) {
        resolve(true);
        return;
      }

      try {
        const tx = dbInstance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const record = {
          key: key,
          data: data,
          updatedAt: Date.now()
        };

        const request = store.put(record);

        request.onsuccess = function() {
          resolve(true);
        };

        request.onerror = function() {
          resolve(false);
        };
      } catch (err) {
        console.warn(`[EtoileCache] Error al guardar clave '${key}' en '${storeName}':`, err);
        resolve(false);
      }
    });
  }

  /**
   * Elimina un registro por clave
   */
  function del(storeName, key) {
    return new Promise((resolve) => {
      if (memoryFallback[storeName]) {
        memoryFallback[storeName].delete(key);
      }

      if (!isIndexedDBAvailable || !dbInstance) {
        resolve(true);
        return;
      }

      try {
        const tx = dbInstance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = function() { resolve(true); };
        request.onerror = function() { resolve(false); };
      } catch (err) {
        resolve(false);
      }
    });
  }

  /**
   * Limpia todos los almacenes de la base de datos (purgado de caché)
   */
  function clearAll() {
    return new Promise((resolve) => {
      Object.keys(memoryFallback).forEach(k => memoryFallback[k].clear());

      if (!isIndexedDBAvailable || !dbInstance) {
        resolve(true);
        return;
      }

      try {
        const tx = dbInstance.transaction(STORES, 'readwrite');
        STORES.forEach(storeName => {
          tx.objectStore(storeName).clear();
        });
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      } catch (err) {
        resolve(false);
      }
    });
  }

  return {
    init: init,
    get: get,
    set: set,
    delete: del,
    clearAll: clearAll,
    isAvailable: function() { return isIndexedDBAvailable; }
  };
})();

// Auto-inicialización inmediata al cargar el script
if (typeof window !== 'undefined') {
  EtoileCache.init();
}
