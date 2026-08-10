interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "brand-mark" }: BrandMarkProps) {
  return (
    <span className={className} aria-hidden="true">
      <img
        className="brand-logo-image"
        src="/brand/favicon-64.png"
        alt=""
        width="64"
        height="64"
        decoding="async"
      />
    </span>
  );
}
