import { useEffect, useState } from "react";

import "./UserAvatar.css";
import { avatarInitials, avatarPublicUrl } from "../../lib/avatar";

interface UserAvatarProps {
  avatarPath?: string;
  displayName?: string;
  email?: string;
  previewUrl?: string;
  alt?: string;
  size?: "small" | "large";
}

export function UserAvatar({
  avatarPath,
  displayName,
  email,
  previewUrl,
  alt = "",
  size = "small",
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = previewUrl ?? avatarPublicUrl(avatarPath);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <span className={`user-avatar ${size}`}>
      {imageUrl && !imageFailed ? (
        <img src={imageUrl} alt={alt} onError={() => setImageFailed(true)} />
      ) : (
        <span
          className="user-avatar-fallback"
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : "true"}
        >
          {avatarInitials(displayName, email)}
        </span>
      )}
    </span>
  );
}
