import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (hash) {
      const targetId = hash.replace(/^#/, "");
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView();
        return;
      }
    }

    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname, search, hash]);

  return null;
}
