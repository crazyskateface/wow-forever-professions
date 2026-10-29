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
  readonly src?: string | undefined;
  readonly fallbackText?: string | undefined;
}

export function ItemIcon({ className, eager = false, gameItemId, name, src, fallbackText }: ItemIconProps) {
  const source = src ?? (gameItemId === undefined ? undefined : `/icons/items/${gameItemId}.webp`);
  const [failedSource, setFailedSource] = useState<string>();
  if (source === undefined || failedSource === source) {
    return <span aria-hidden="true" className={className}>{fallbackText ?? initials(name)}</span>;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailedSource(source)}
      src={source}
    />
  );
}
