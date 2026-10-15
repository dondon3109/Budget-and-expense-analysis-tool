import { createRoot } from "react-dom/client";

import { BrowserApplication } from "./BrowserApplication";
import { syncReduceMotionAttribute } from "./hooks/useReducedMotion";
import { trackScrollActivity } from "./lib/scrollActivity";
import { registerZoptionServiceWorker } from "./pwa/registerServiceWorker";

// Keep components out of this entry. A component here makes the React plugin mark the entry as a
// Fast Refresh boundary, so a dependency edit re-runs it in place and calls createRoot on #root a
// second time; two roots then fight over the DOM. Without one, Vite reloads the page instead.
const root = document.getElementById("root");
if (!root) throw new Error("Zoption could not find the application root.");

syncReduceMotionAttribute();
createRoot(root).render(<BrowserApplication />);

registerZoptionServiceWorker();
trackScrollActivity();
