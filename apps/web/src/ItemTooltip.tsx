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
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  formatTooltipSellPrice,
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  useLayoutEffect(() => {
    if (active?.mode === "pinned") closeButtonRef.current?.focus();
  }, [active?.id, active?.mode]);

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
    if (active === undefined) return;
    const dismissOutside = (event: PointerEvent) => {
      if (active.mode !== "pinned") return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (active.anchor.contains(target) || panelRef.current?.contains(target)) return;
      setActive(undefined);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (active.mode === "pinned") closePinnedAndRestoreFocus();
      else setActive(undefined);
    };
    if (active.mode === "pinned") {
      document.addEventListener("pointerdown", dismissOutside, true);
    }
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
  const equipmentSlot = active === undefined
    ? undefined
    : active.item.equipmentSlot ?? getInventoryTypeLabel(active.item.inventoryType);
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
                ref={closeButtonRef}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>
          {equipmentSlot ? <span className="item-tooltip-slot">{equipmentSlot}</span> : null}
          {category ? <span className="item-tooltip-category">{category}</span> : null}
          {active.item.armor === undefined ? null : (
            <span className="item-tooltip-stat">{active.item.armor} Armor</span>
          )}
          {active.item.requiredLevel === undefined || active.item.requiredLevel === 0 ? null : (
            <span className="item-tooltip-stat">Requires Level {active.item.requiredLevel}</span>
          )}
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
          {active.item.sellPriceCopper === undefined ? null : (
            <span className="item-tooltip-sell-price">
              Sell price: {formatTooltipSellPrice(active.item.sellPriceCopper)}
            </span>
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

function useItemTooltipTrigger(item: ItemTooltipData) {
  const id = useId();
  const triggerRef = useRef<HTMLElement>(null);
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

  function showFocusPreview(): void {
    const anchor = triggerRef.current;
    if (anchor?.dataset.suppressItemTooltipFocus === "true") {
      delete anchor.dataset.suppressItemTooltipFocus;
      return;
    }
    if (anchor && active?.mode !== "pinned") preview(id, anchor, item);
  }

  function pinFromTrigger(): void {
    clearHoverTimer();
    const anchor = triggerRef.current;
    if (anchor) pin(id, anchor, item);
  }

  return {
    active,
    ariaDescriptionId: isCurrent && !isPinned ? TOOLTIP_PANEL_ID : undefined,
    clearPreview: () => closePreview(id),
    dataMode: isCurrent ? active.mode : undefined,
    isCurrent,
    isPinned,
    pinFromTrigger,
    showFocusPreview,
    startHover,
    stopHover,
    triggerRef,
  };
}

interface ItemTooltipProps {
  readonly children: ReactNode;
  readonly item: ItemTooltipData;
  readonly pinnable?: boolean;
}

export function ItemTooltip({ children, item }: ItemTooltipProps) {
  const trigger = useItemTooltipTrigger(item);

  return (
    <button
      aria-controls={trigger.isCurrent ? TOOLTIP_PANEL_ID : undefined}
      aria-describedby={trigger.ariaDescriptionId}
      aria-expanded={trigger.isPinned}
      aria-haspopup="dialog"
      aria-label={`${trigger.isPinned ? "Hide" : "Show"} item details for ${item.name}`}
      className="item-tooltip-trigger item-tooltip-trigger-button"
      data-tooltip-open={trigger.dataMode}
      onBlur={trigger.clearPreview}
      onClick={trigger.pinFromTrigger}
      onFocus={trigger.showFocusPreview}
      onPointerEnter={trigger.startHover}
      onPointerLeave={trigger.stopHover}
      ref={trigger.triggerRef as RefObject<HTMLButtonElement>}
      type="button"
    >
      {children}
    </button>
  );
}

interface ItemTooltipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly item: ItemTooltipData;
}

export function ItemTooltipButton({
  children,
  item,
  onBlur,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  ...props
}: ItemTooltipButtonProps) {
  const trigger = useItemTooltipTrigger(item);
  const describedBy = [props["aria-describedby"], trigger.ariaDescriptionId]
    .filter(Boolean)
    .join(" ") || undefined;
  return (
    <button
      {...props}
      aria-describedby={describedBy}
      data-tooltip-open={trigger.dataMode}
      onBlur={(event) => {
        onBlur?.(event);
        trigger.clearPreview();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) trigger.showFocusPreview();
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented) trigger.startHover();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        trigger.stopHover();
      }}
      ref={trigger.triggerRef as RefObject<HTMLButtonElement>}
    >
      {children}
    </button>
  );
}

interface ItemTooltipSummaryProps extends HTMLAttributes<HTMLElement> {
  readonly item: ItemTooltipData;
}

export function ItemTooltipSummary({
  children,
  item,
  onBlur,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  ...props
}: ItemTooltipSummaryProps) {
  const trigger = useItemTooltipTrigger(item);
  const describedBy = [props["aria-describedby"], trigger.ariaDescriptionId]
    .filter(Boolean)
    .join(" ") || undefined;
  return (
    <summary
      {...props}
      aria-describedby={describedBy}
      data-tooltip-open={trigger.dataMode}
      onBlur={(event) => {
        onBlur?.(event);
        trigger.clearPreview();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) trigger.showFocusPreview();
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented) trigger.startHover();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        trigger.stopHover();
      }}
      ref={trigger.triggerRef}
    >
      {children}
    </summary>
  );
}
