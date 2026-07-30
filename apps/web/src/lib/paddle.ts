import { initializePaddle } from "@paddle/paddle-js";

let paddlePromise: ReturnType<typeof initializePaddle> | undefined;

export function getPaddle() {
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();
  if (!token) throw new Error("Paddle checkout is not configured yet.");
  paddlePromise ??= initializePaddle({
    token,
    environment: import.meta.env.VITE_PADDLE_ENV === "production" ? "production" : "sandbox",
  });
  return paddlePromise;
}
