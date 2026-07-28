import { createAccountDeletionService } from "./account-deletion";
import { createApp } from "./app";
import { assistantRepository } from "./db/assistant";
import type { Bindings } from "./types";

const app = createApp();
const accountDeletionService = createAccountDeletionService();

export default {
  fetch: app.fetch,
  async scheduled(_controller, env) {
    for (;;) {
      const deleted = await assistantRepository.cleanupExpired(env);
      if (deleted > 0)
        console.log(JSON.stringify({ message: "Expired assistant chats deleted", deleted }));
      if (deleted < 100) break;
    }
    const reconciled = await accountDeletionService.reconcile(env, 25);
    if (reconciled > 0)
      console.log(JSON.stringify({ message: "Pending account deletions reconciled", reconciled }));
  },
} satisfies ExportedHandler<Bindings>;
