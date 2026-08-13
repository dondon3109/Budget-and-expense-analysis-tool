# Optional product screenshots

Add local product screenshots here, then set the matching `asset.src` value in
`src/config/adData.ts`, for example:

```ts
asset: {
  src: "screenshots/dashboard.png",
  alt: "Zoption dashboard showing a monthly overview",
  fit: "cover",
  position: "top center",
}
```

PNG, JPEG, and WebP images work well. Capture a clean account with non-sensitive demo data at a
high resolution. If `src` is omitted, the ads render the built-in illustrative product UI instead.
