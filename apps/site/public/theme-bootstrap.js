(() => {
  let theme;
  try {
    const saved = localStorage.getItem("zoption-theme");
    if (saved === "light" || saved === "dark" || saved === "coffee") {
      theme = saved;
    } else {
      const legacy = localStorage.getItem("clarity-theme");
      if (legacy === "light" || legacy === "dark") {
        theme = legacy;
        localStorage.setItem("zoption-theme", legacy);
        localStorage.removeItem("clarity-theme");
      }
    }
  } catch {
    // Storage may be unavailable; the system preference remains a safe fallback.
  }
  if (!theme) {
    try {
      theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      theme = "light";
    }
  }
  const themeColors = {
    light: "#f1f3f2",
    dark: "#080b0a",
    coffee: "#ece3d5",
  };
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
})();
