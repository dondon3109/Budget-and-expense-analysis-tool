export interface ReleaseChange {
  title: string;
  description: string;
}

export interface ProductRelease {
  version: string;
  releasedOn: string;
  changes: readonly ReleaseChange[];
}

export const currentRelease: ProductRelease = {
  version: __APP_VERSION__,
  releasedOn: "August 4, 2026",
  changes: [
    {
      title: "Mobile theme picker polish",
      description: "Theme options are now more compact and easier to scan on small screens.",
    },
    {
      title: "Compare plans by swiping on mobile",
      description:
        "Free and Zoption Pro now sit side by side so you can swipe to compare feature limits.",
    },
    {
      title: "A taller assistant on mobile",
      description:
        "The AI assistant now fills the screen so the full conversation and your message box stay visible.",
    },
    {
      title: "Version in the footer",
      description: "Tap the version in the footer to review the latest changes anytime.",
    },
  ],
};
