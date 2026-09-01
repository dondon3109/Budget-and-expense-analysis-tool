if (typeof window !== "undefined") {
  const storeMap = new WeakMap<Storage, Map<string, string>>();

  function getStore(storage: Storage): Map<string, string> {
    let map = storeMap.get(storage);
    if (!map) {
      map = new Map<string, string>();
      storeMap.set(storage, map);
    }
    return map;
  }

  if (typeof Storage !== "undefined") {
    Storage.prototype.getItem = function (key: string): string | null {
      return getStore(this).get(key) ?? null;
    };
    Storage.prototype.setItem = function (key: string, value: string): void {
      getStore(this).set(key, String(value));
    };
    Storage.prototype.removeItem = function (key: string): void {
      getStore(this).delete(key);
    };
    Storage.prototype.clear = function (): void {
      getStore(this).clear();
    };
    Storage.prototype.key = function (index: number): string | null {
      return Array.from(getStore(this).keys())[index] ?? null;
    };
    Object.defineProperty(Storage.prototype, "length", {
      get(): number {
        return getStore(this).size;
      },
      configurable: true,
      enumerable: false,
    });
  }

  const createStorage = (): Storage => {
    const storage = Object.create(Storage.prototype) as Storage;

    return new Proxy(storage, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target) && typeof target.getItem === "function") {
          return target.getItem(prop) ?? undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop === "string" && !(prop in target) && typeof target.setItem === "function") {
          target.setItem(prop, value);
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
      deleteProperty(target, prop) {
        if (typeof prop === "string" && !(prop in target) && typeof target.removeItem === "function") {
          target.removeItem(prop);
          return true;
        }
        return Reflect.deleteProperty(target, prop);
      },
    });
  };

  const localStorageInstance = createStorage();
  const sessionStorageInstance = createStorage();

  Object.defineProperty(window, "localStorage", {
    value: localStorageInstance,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageInstance,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: sessionStorageInstance,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: sessionStorageInstance,
    configurable: true,
    writable: true,
  });
}
