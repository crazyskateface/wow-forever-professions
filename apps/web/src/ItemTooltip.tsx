import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  getInventoryTypeLabel,
  getItemCategoryLabel,
  ITEM_TOOLTIP_HOVER_DELAY_MS,
  type ItemTooltipData,
} from "./item-tooltip.js";

type TooltipMode = "preview" | "pinned";

interface ActiveTooltip {
  readonly anchor: HTMLElement;
  readonly id: string;
  readonly item: ItemTooltipData;
  readonly mode: TooltipMode;
}

interface TooltipPosition {
  readonly left: number;
  readonly top: number;
}

interface ItemTooltipContextValue {
  readonly active: ActiveTooltip | undefined;
  readonly closePreview: (id: string) => void;
  readonly dismiss: (id: string) => void;
  readonly pin: (id: string, anchor: HTMLElement, item: ItemTooltipData) => void;
  readonly preview: (id: string, anchor: HTMLElement, item: ItemTooltipData) => void;
  readonly syncItem: (id: string, item: ItemTooltipData) => void;
}

const ItemTooltipContext = createContext<ItemTooltipContextValue | undefined>(undefined);
const TOOLTIP_PANEL_ID = "active-item-tooltip";

function useItemTooltipContext(): ItemTooltipContextValue {
  const context = useContext(ItemTooltipContext);
  if (context === undefined) {
    throw new Error("ItemTooltip must be rendered inside ItemTooltipProvider.");
  }
  return context;
}

export function ItemTooltipProvider({ children }: { readonly children: ReactNode }) {
  const [active, setActive] = useState<ActiveTooltip>();
  const [position, setPosition] = useState<TooltipPosition>();
  const panelRef = useRef<HTMLDivElement>(null);

  const preview = useCallback(
    (id: string, anchor: HTMLElement, item: ItemTooltipData) => {
      setActive((current) => {
        if (current?.mode === "pinned") return current;
        return { anchor, id, item, mode: "preview" };
      });
    },
    [],
  );

  const closePreview = useCallback((id: string) => {
    setActive((current) => current?.id === id && current.mode === "preview" ? undefined : current);
  }, []);

  const dismiss = useCallback((id: string) => {
    setActive((current) => current?.id === id ? undefined : current);
  }, []);

  const pin = useCallback((id: string, anchor: HTMLElement, item: ItemTooltipData) => {
    setActive((current) => current?.id === id && current.mode === "pinned"
      ? undefined
      : { anchor, id, item, mode: "pinned" });
  }, []);

  const syncItem = useCallback((id: string, item: ItemTooltipData) => {
    setActive((current) => {
      if (current?.id !== id || JSON.stringify(current.item) === JSON.stringify(item)) {
        return current;
      }
      return { ...current, item };
    });
  }, []);

  const closePinnedAndRestoreFocus = useCallback(() => {
    if (active?.mode !== "pinned") {
      setActive(undefined);
      return;
    }
    const anchor = active.anchor;
    anchor.dataset.suppressItemTooltipFocus = "true";
    setActive(undefined);
    window.requestAnimationFrame(() => {
      anchor.focus();
      window.requestAnimationFrame(() => delete anchor.dataset.suppressItemTooltipFocus);
    });
  }, [active]);

  const updatePosition = useCallback(() => {
    if (active === undefined || panelRef.current === null) return;
    if (!active.anchor.isConnected) {
      setActive(undefined);
      return;
    }
    const anchorRect = active.anchor.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 12;
    const maxLeft = Math.max(margin, window.innerWidth - panelRect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - panelRect.height - margin);
    let left = anchorRect.right + gap;
    if (left + panelRect.width > window.innerWidth - margin) {
      left = anchorRect.left - panelRect.width - gap;
    }
    if (left < margin) left = Math.min(maxLeft, Math.max(margin, anchorRect.left));
    setPosition({
      left: Math.min(maxLeft, Math.max(margin, left)),
      top: Math.min(maxTop, Math.max(margin, anchorRect.top)),
    });
  }, [active]);

  useLayoutEffect(() => {
    setPosition(undefined);
    updatePosition();
  }, [active, updatePosition]);

  useEffect(() => {
    if (active === undefined) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [active, updatePosition]);

  useEffect(() => {
    if (active?.mode !== "pinned") return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (active.anchor.contains(target) || panelRef.current?.contains(target)) return;
      setActive(undefined);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePinnedAndRestoreFocus();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [active, closePinnedAndRestoreFocus]);

  const context = useMemo<ItemTooltipContextValue>(
    () => ({ active, closePreview, dismiss, pin, preview, syncItem }),
    [active, closePreview, dismiss, pin, preview, syncItem],
  );
  const inventoryType = active === undefined ? undefined : getInventoryTypeLabel(active.item.inventoryType);
  const category = active === undefined ? undefined : getItemCategoryLabel(active.item);

  return (
    <ItemTooltipContext.Provider value={context}>
      {children}
      {active !== undefined && typeof document !== "undefined" ? createPortal(
        <div
          aria-label={active.mode === "pinned" ? `${active.item.name} item details` : undefined}
          className={`item-tooltip item-tooltip-${active.mode}`}
          id={TOOLTIP_PANEL_ID}
          ref={panelRef}
          role={active.mode === "pinned" ? "dialog" : "tooltip"}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position === undefined ? "hidden" : "visible",
          }}
        >
          <div className="item-tooltip-heading">
            <strong>{active.item.name}</strong>
            {active.mode === "pinned" ? (
              <button
                aria-label="Close item details"
                className="item-tooltip-close"
                onClick={closePinnedAndRestoreFocus}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>
          {inventoryType ? <span className="item-tooltip-slot">{inventoryType}</span> : null}
          {category ? <span className="item-tooltip-category">{category}</span> : null}
          {active.item.classification ? (
            <span className={`item-tooltip-classification${active.item.classification.label.toLowerCase() === "scarce" ? " is-scarce" : ""}`}>
              {active.item.classification.label}
            </span>
          ) : null}
          {active.item.details?.length ? (
            <div className="item-tooltip-details">
              {active.item.details.map((detail, index) => (
                <span className={detail.tone ? `is-${detail.tone}` : undefined} key={`${detail.text}-${index}`}>
                  {detail.text}
                </span>
              ))}
            </div>
          ) : null}
          {active.item.gameItemId === undefined ? null : (
            <span className="item-tooltip-id">Item #{active.item.gameItemId}</span>
          )}
          {active.mode === "pinned" ? (
            <span className="item-tooltip-hint">Press Esc or click outside to close</span>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </ItemTooltipContext.Provider>
  );
}

interface ItemTooltipProps {
  readonly children: ReactNode;
  readonly item: ItemTooltipData;
  readonly pinnable?: boolean;
}

export function ItemTooltip({ children, item, pinnable = false }: ItemTooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | HTMLSpanElement>(null);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const { active, closePreview, dismiss, pin, preview, syncItem } = useItemTooltipContext();
  const isCurrent = active?.id === id;
  const isPinned = isCurrent && active.mode === "pinned";
  const itemFingerprint = JSON.stringify(item);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current === undefined) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = undefined;
  }, []);

  useEffect(() => () => {
    clearHoverTimer();
    dismiss(id);
  }, [clearHoverTimer, dismiss, id]);

  useEffect(() => {
    if (isCurrent) syncItem(id, item);
  }, [id, isCurrent, itemFingerprint, syncItem]);

  function startHover(): void {
    if (isPinned || active?.mode === "pinned") return;
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      const anchor = triggerRef.current;
      if (anchor) preview(id, anchor, item);
      hoverTimerRef.current = undefined;
    }, ITEM_TOOLTIP_HOVER_DELAY_MS);
  }

  function stopHover(): void {
    clearHoverTimer();
    closePreview(id);
  }

  const sharedProps = {
    "aria-describedby": isCurrent && !isPinned ? TOOLTIP_PANEL_ID : undefined,
    "data-tooltip-open": isCurrent ? active.mode : undefined,
    onPointerEnter: startHover,
    onPointerLeave: stopHover,
  } as const;

  if (!pinnable) {
    return (
      <span className="item-tooltip-trigger" ref={triggerRef as RefObject<HTMLSpanElement>} {...sharedProps}>
        {children}
      </span>
    );
  }

  return (
    <button
      aria-controls={isCurrent ? TOOLTIP_PANEL_ID : undefined}
      aria-expanded={isPinned}
      aria-haspopup="dialog"
      aria-label={`${isPinned ? "Hide" : "Show"} item details for ${item.name}`}
      className="item-tooltip-trigger item-tooltip-trigger-button"
      onBlur={() => closePreview(id)}
      onClick={() => {
        clearHoverTimer();
        const anchor = triggerRef.current;
        if (anchor) pin(id, anchor, item);
      }}
      onFocus={() => {
        const anchor = triggerRef.current;
        if (anchor?.dataset.suppressItemTooltipFocus === "true") {
          delete anchor.dataset.suppressItemTooltipFocus;
          return;
        }
        if (anchor && active?.mode !== "pinned") preview(id, anchor, item);
      }}
      ref={triggerRef as RefObject<HTMLButtonElement>}
      type="button"
      {...sharedProps}
    >
      {children}
    </button>
  );
}
