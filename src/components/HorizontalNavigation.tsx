"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { navigationOverflowState } from "@/lib/horizontal-navigation";

type Props = { children: ReactNode; ariaLabel: string; className?: string; navClassName?: string };

export default function HorizontalNavigation({ children, ariaLabel, className = "", navClassName = "" }: Props) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState({ overflow: false, left: false, right: false });
  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const next = navigationOverflowState(nav.scrollLeft, nav.clientWidth, nav.scrollWidth);
    setState(current => current.overflow === next.overflow && current.left === next.left && current.right === next.right ? current : next);
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
    const resizeObserver = new ResizeObserver(measure);
    const mutationObserver = new MutationObserver(measure);
    resizeObserver.observe(nav);
    mutationObserver.observe(nav, { childList: true, subtree: true, characterData: true });
    nav.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => { window.cancelAnimationFrame(frame); resizeObserver.disconnect(); mutationObserver.disconnect(); nav.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [measure, pathname]);
  function scroll(direction: "left" | "right") {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollBy({ left: (direction === "right" ? 1 : -1) * Math.max(220, Math.floor(nav.clientWidth * 0.7)), behavior: "smooth" });
  }
  return <div className={`relative min-w-0 ${className}`}>
    <nav ref={navRef} aria-label={ariaLabel} data-overflow={state.overflow ? "true" : "false"} className="scrollbar-hide min-w-0 overflow-x-auto"><div className={`flex w-max min-w-full items-center ${navClassName}`}>{children}</div></nav>
    {state.left && <button type="button" onClick={() => scroll("left")} aria-label="Ver opções anteriores" title="Ver opções anteriores" className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-orange-200 hover:text-orange-600"><ChevronLeft size={17}/></button>}
    {state.right && <button type="button" onClick={() => scroll("right")} aria-label="Ver mais opções" title="Ver mais opções" className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-orange-200 hover:text-orange-600"><ChevronRight size={17}/></button>}
  </div>;
}
