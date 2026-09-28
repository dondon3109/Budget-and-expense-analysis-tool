import { addDatabaseChangeListener } from "expo-sqlite";

interface LocalChangeSubscriber {
  tables: Set<string>;
  refresh: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface LocalChangeStream {
  subscription: ReturnType<typeof addDatabaseChangeListener>;
  subscribers: Set<LocalChangeSubscriber>;
}

// A sync pull applies a whole page inside one SQLite transaction, so one row
// change event arrives per applied row. Coalescing gives each subscriber a
// single refresh for the burst instead of one full re-query per row.
const CHANGE_COALESCE_MS = 50;

const localChangeStreams = new Map<string, LocalChangeStream>();

function createLocalChangeStream(databaseName: string): LocalChangeStream {
  const subscribers = new Set<LocalChangeSubscriber>();
  const subscription = addDatabaseChangeListener((event) => {
    if (!event.databaseFilePath.endsWith(databaseName)) return;
    for (const subscriber of subscribers) {
      if (!subscriber.tables.has(event.tableName)) continue;
      if (subscriber.timer) clearTimeout(subscriber.timer);
      subscriber.timer = setTimeout(() => {
        subscriber.timer = null;
        subscriber.refresh();
      }, CHANGE_COALESCE_MS);
    }
  });
  const stream: LocalChangeStream = { subscription, subscribers };
  localChangeStreams.set(databaseName, stream);
  return stream;
}

/**
 * Subscribes `refresh` to changes in `tables` on one workspace database. All
 * hooks share a single native subscription per database, and the returned
 * unsubscribe cancels a coalesced refresh that has not fired yet so an
 * unmounted hook cannot set state.
 */
export function subscribeToLocalChanges(
  databaseName: string,
  tables: readonly string[],
  refresh: () => void,
): () => void {
  const stream = localChangeStreams.get(databaseName) ?? createLocalChangeStream(databaseName);
  const subscriber: LocalChangeSubscriber = { tables: new Set(tables), refresh, timer: null };
  stream.subscribers.add(subscriber);
  return () => {
    if (subscriber.timer) clearTimeout(subscriber.timer);
    subscriber.timer = null;
    stream.subscribers.delete(subscriber);
    if (stream.subscribers.size === 0) {
      stream.subscription.remove();
      localChangeStreams.delete(databaseName);
    }
  };
}
