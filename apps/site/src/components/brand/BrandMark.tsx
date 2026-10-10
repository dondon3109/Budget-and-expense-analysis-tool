interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "brand-mark" }: BrandMarkProps) {
  return (
    // The wrapper is aria-hidden, so screen readers skip the alt; it exists because Bing Site Scan
    // flags an empty alt as missing.
    <span className={className} aria-hidden="true">
      <img
        className="brand-logo-image"
        src="/brand/zoption-mark.svg"
        alt="Zoption"
        width="64"
        height="64"
        decoding="async"
      />
    </span>
  );
}
