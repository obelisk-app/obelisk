'use client';

import { useRef, useState } from 'react';

/**
 * The highlighted category and a jump that smooth-scrolls the grid to the
 * section marked `data-emoji-category="<name>"`.
 */
export function useCategoryJump(initial = 'Recent') {
  const [activeCategory, setActiveCategory] = useState(initial);
  const scrollRef = useRef<HTMLDivElement>(null);
  const jumpToCategory = (category: string) => {
    setActiveCategory(category);
    const scroller = scrollRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-emoji-category="${category}"]`);
    if (scroller && target) scroller.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  };
  return { activeCategory, scrollRef, jumpToCategory };
}
