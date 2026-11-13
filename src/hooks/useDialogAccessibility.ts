import { useEffect, useRef, type RefObject } from 'react';

interface DialogOptions {
  isOpen?: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Keep focus contained while an operation temporarily prevents dismissal. */
  disabled?: boolean;
}
interface OpenDialog { element: HTMLElement; order: number }
const dialogs = new Set<OpenDialog>();
const muted = new Map<HTMLElement, { hidden: string | null; inert: boolean }>();
let activeDialog: OpenDialog | undefined;
let sequence = 0;
let bodyStyles: { overflow: string; paddingRight: string; overscrollBehavior: string } | undefined;
const focusableSelector = 'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

function visible(element: HTMLElement): boolean {
  return element.isConnected && !element.closest('[hidden],[inert],[aria-hidden="true"]')
    && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}
function focusable(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(focusableSelector)].filter(item => item.tabIndex >= 0 && visible(item));
}
function layer(element: HTMLElement): number {
  let index = 0;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const value = Number.parseInt(getComputedStyle(current).zIndex, 10);
    if (Number.isFinite(value)) index = Math.max(index, value);
  }
  return index;
}
function topDialog(): OpenDialog | undefined {
  return [...dialogs].filter(dialog => dialog.element.isConnected).sort((first, second) => {
    if (first.element.contains(second.element)) return -1;
    if (second.element.contains(first.element)) return 1;
    const difference = layer(first.element) - layer(second.element);
    if (difference) return difference;
    const position = first.element.compareDocumentPosition(second.element);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return first.order - second.order;
  }).at(-1);
}
function restoreMuted(element: HTMLElement) {
  const original = muted.get(element);
  if (!original) return;
  if (original.hidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', original.hidden);
  element.inert = original.inert;
  muted.delete(element);
}
function syncModalLayers() {
  const top = topDialog();
  activeDialog = top;
  const inactive = new Set([...dialogs].filter(dialog => dialog !== top && top && !dialog.element.contains(top.element)).map(dialog => dialog.element));
  for (const element of muted.keys()) if (!inactive.has(element)) restoreMuted(element);
  for (const element of inactive) {
    if (!muted.has(element)) muted.set(element, { hidden: element.getAttribute('aria-hidden'), inert: element.inert });
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
  }
}
function lockBody() {
  if (bodyStyles) return;
  bodyStyles = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight, overscrollBehavior: document.body.style.overscrollBehavior };
  const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  if (scrollbar) document.body.style.paddingRight = `${(Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0) + scrollbar}px`;
  document.body.style.overflow = 'hidden';
  document.body.style.overscrollBehavior = 'none';
}
function unlockBody() {
  if (dialogs.size || !bodyStyles) return;
  Object.assign(document.body.style, bodyStyles);
  bodyStyles = undefined;
}

/** Shared focus and scroll lifecycle; dialog roles and labels stay in the markup. */
export function useDialogAccessibility<T extends HTMLElement = HTMLDivElement>({ isOpen = true, onClose, initialFocusRef, returnFocusRef, disabled = false }: DialogOptions): RefObject<T | null> {
  const panelRef = useRef<T | null>(null);
  const options = useRef({ onClose, initialFocusRef, returnFocusRef, disabled });
  options.current = { onClose, initialFocusRef, returnFocusRef, disabled };
  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalTabIndex = panel.getAttribute('tabindex');
    if (originalTabIndex === null) panel.tabIndex = -1;
    const dialog = { element: panel, order: ++sequence };
    dialogs.add(dialog);
    lockBody();
    let lastFocus: HTMLElement | null = null;
    const focusInside = () => {
      const requested = options.current.initialFocusRef?.current;
      const target = requested && panel.contains(requested) && visible(requested) ? requested
        : lastFocus && panel.contains(lastFocus) && visible(lastFocus) ? lastFocus : focusable(panel)[0] || panel;
      target.focus({ preventScroll: true });
    };
    queueMicrotask(() => {
      if (!dialogs.has(dialog)) return;
      if (topDialog() === dialog) focusInside();
      syncModalLayers();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (topDialog() !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!options.current.disabled) options.current.onClose();
      } else if (event.key === 'Tab') {
        const items = focusable(panel);
        const current = document.activeElement;
        if (!items.length) { event.preventDefault(); panel.focus({ preventScroll: true }); }
        else if (event.shiftKey && (current === items[0] || !items.includes(current as HTMLElement))) {
          event.preventDefault(); items.at(-1)!.focus({ preventScroll: true });
        } else if (!event.shiftKey && (current === items.at(-1) || !items.includes(current as HTMLElement))) {
          event.preventDefault(); items[0].focus({ preventScroll: true });
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (topDialog() !== dialog) return;
      if (event.target instanceof HTMLElement && panel.contains(event.target)) lastFocus = event.target;
      else focusInside();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus, true);
      const wasTop = activeDialog === dialog || topDialog() === dialog;
      dialogs.delete(dialog);
      restoreMuted(panel);
      syncModalLayers();
      if (originalTabIndex === null) panel.removeAttribute('tabindex');
      else panel.setAttribute('tabindex', originalTabIndex);
      unlockBody();
      queueMicrotask(() => {
        if (!wasTop) return;
        const top = topDialog();
        const restoreTarget = options.current.returnFocusRef?.current || previousFocus;
        if (restoreTarget && visible(restoreTarget) && (!top || top.element.contains(restoreTarget))) restoreTarget.focus({ preventScroll: true });
        else if (top && !top.element.contains(document.activeElement)) (focusable(top.element)[0] || top.element).focus({ preventScroll: true });
      });
    };
  }, [isOpen]);
  return panelRef;
}
