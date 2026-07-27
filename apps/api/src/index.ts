import { createApp } from "./app";
import { assistantRepository } from "./db/assistant";
import type { Bindings } from "./types";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, env) {
    for (;;) {
      const deleted = await assistantRepository.cleanupExpired(env);
      if (deleted > 0)
        console.log(JSON.stringify({ message: "Expired assistant chats deleted", deleted }));
      if (deleted < 100) break;
    }
  },
} satisfies ExportedHandler<Bindings>;
