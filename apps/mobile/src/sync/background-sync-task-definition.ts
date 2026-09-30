import * as TaskManager from "expo-task-manager";

import { BACKGROUND_SYNC_TASK_NAME, runBackgroundSync } from "./background-sync-task";

// Defined at module scope per the expo-background-task contract: the task must
// exist before registerTaskAsync runs and before the OS delivers a pending
// execution on launch. This lives apart from background-sync-task because
// app/_layout.tsx also imports that module by name, and Metro merges a bare
// import into a named import of the same module and then inlines it to the
// point of use, which would defer this call into an effect. Import this module
// bare and never by name.
TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => runBackgroundSync());
