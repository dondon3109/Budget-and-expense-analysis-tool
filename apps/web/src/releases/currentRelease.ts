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
  releasedOn: "July 29, 2026",
  changes: [
    {
      title: "Reliable same-day ordering",
      description: "Newer-created transactions now appear first when transaction dates match.",
    },
    {
      title: "Sort transactions your way",
      description: "Choose date, description, or amount ordering from the transaction list.",
    },
    {
      title: "Release updates in the app",
      description: "Zoption now shares a concise summary when a new version is available.",
    },
  ],
};
