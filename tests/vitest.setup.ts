if (typeof window !== "undefined") {
  const createStorage = (): Storage => {
    const memory = new Map<string, string>();
    const storage: Storage = {
      getItem(key: string): string | null {
        return memory.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        memory.set(key, String(value));
      },
      removeItem(key: string): void {
        memory.delete(key);
      },
      clear(): void {
        memory.clear();
      },
      key(index: number): string | null {
        return Array.from(memory.keys())[index] ?? null;
      },
      get length(): number {
        return memory.size;
      },
    };

    return new Proxy(storage, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target)) {
          return target.getItem(prop) ?? undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop === "string" && !(prop in target)) {
          target.setItem(prop, value);
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
      deleteProperty(target, prop) {
        if (typeof prop === "string" && !(prop in target)) {
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
