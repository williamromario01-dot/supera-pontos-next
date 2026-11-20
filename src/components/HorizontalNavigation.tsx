"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

type Props = { children: ReactNode; ariaLabel: string; className?: string; navClassName?: string };

export default function HorizontalNavigation({ children, ariaLabel, className = "", navClassName = "" }: Props) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState({ overflow: false, left: false, right: false });
  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const overflow = nav.scrollWidth > nav.clientWidth + 5;
    const left = overflow && nav.scrollLeft > 5;
    const right = overflow && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 5;
    setState(current => current.overflow === overflow && current.left === left && current.right === right ? current : { overflow, left, right });
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const frame = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(measure);
    const mutationObserver = new MutationObserver(measure);
    resizeObserver.observe(nav);
    mutationObserver.observe(nav, { childList: true, subtree: true, characterData: true });
    nav.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { window.cancelAnimationFrame(frame); resizeObserver.disconnect(); mutationObserver.disconnect(); nav.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [measure, pathname]);
  function scroll(direction: "left" | "right") {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollBy({ left: (direction === "right" ? 1 : -1) * Math.max(220, Math.floor(nav.clientWidth * 0.7)), behavior: "smooth" });
  }
  return <div className={`relative min-w-0 ${className}`}>
    <nav ref={navRef} aria-label={ariaLabel} className={`scrollbar-hide min-w-0 overflow-x-auto ${state.overflow ? "px-10" : ""} ${navClassName}`}>{children}</nav>
    {state.overflow && <><button type="button" onClick={() => scroll("left")} disabled={!state.left} aria-label="Ver opções anteriores" title="Ver opções anteriores" className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-default disabled:opacity-35"><ChevronLeft size={17}/></button><button type="button" onClick={() => scroll("right")} disabled={!state.right} aria-label="Ver mais opções" title="Ver mais opções" className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-default disabled:opacity-35"><ChevronRight size={17}/></button></>}
  </div>;
}
