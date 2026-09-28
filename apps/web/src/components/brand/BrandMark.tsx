interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "brand-mark" }: BrandMarkProps) {
  return (
    <span className={className} aria-hidden="true">
      <img
        className="brand-logo-image"
        src="/brand/zoption-mark.svg"
        alt=""
        width="64"
        height="64"
        decoding="async"
      />
    </span>
  );
}
