import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import "./ConnectivityStatus.css";

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function ConnectivityStatus() {
  const [online, setOnline] = useState(browserIsOnline);

  useEffect(() => {
    function syncConnection() {
      setOnline(browserIsOnline());
    }

    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    return () => {
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
    };
  }, []);

  if (online) return null;

  return (
    <aside className="connectivity-status" role="status" aria-live="polite">
      <WifiOff size={18} aria-hidden="true" />
      <span>
        <strong>Internet connection required.</strong> Financial data, imports, billing, and account
        changes cannot be completed or saved until Zoption is online.
      </span>
    </aside>
  );
}
