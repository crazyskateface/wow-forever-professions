import { useState } from "react";

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface ItemIconProps {
  readonly className: string;
  readonly eager?: boolean;
  readonly gameItemId: number | undefined;
  readonly name: string;
}

export function ItemIcon({ className, eager = false, gameItemId, name }: ItemIconProps) {
  const [failedItemId, setFailedItemId] = useState<number>();
  if (gameItemId === undefined || failedItemId === gameItemId) {
    return <span aria-hidden="true" className={className}>{initials(name)}</span>;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailedItemId(gameItemId)}
      src={`/icons/items/${gameItemId}.webp`}
    />
  );
}
