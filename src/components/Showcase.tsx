'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import Image from 'next/image';

export type ShowcaseItem = {
  src: string;
  alt: string;
  width: number;
  height: number;
  badge: string;
  title: string;
  description: string;
  features: string[];
  orientation: 'portrait' | 'landscape';
  priority?: boolean;
};

function useReveal<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

export function ShowcaseRow({ item, index }: { item: ShowcaseItem; index: number }) {
  const [ref, visible] = useReveal<HTMLDivElement>();
  const isPortrait = item.orientation === 'portrait';
  const reverse = index % 2 === 1;

  return (
    <article
      ref={ref}
      className={`relative ${visible ? 'animate-fade-in-up' : 'opacity-0'}`}
      itemScope
      itemType="https://schema.org/ImageObject"
    >
      <div
        className={`grid items-center gap-10 lg:gap-16 ${
          isPortrait
            ? 'lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'
            : 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'
        }`}
      >
        <figure
          className={`mx-auto w-full ${reverse ? 'lg:order-2' : ''} ${
            isPortrait ? 'max-w-sm' : 'max-w-3xl'
          }`}
        >
          <div
            className={`relative overflow-hidden border border-lc-border bg-lc-dark shadow-[0_40px_120px_-40px_rgba(180,249,83,0.18)] ${
              isPortrait ? 'rounded-[2.25rem]' : 'rounded-2xl'
            }`}
          >
            <Image
              src={item.src}
              alt={item.alt}
              width={item.width}
              height={item.height}
              className="w-full h-auto block"
              sizes={
                isPortrait
                  ? '(max-width: 1024px) 80vw, 360px'
                  : '(max-width: 1024px) 90vw, 720px'
              }
              priority={item.priority}
              itemProp="contentUrl"
            />
          </div>
          <figcaption className="sr-only" itemProp="description">
            {item.alt}
          </figcaption>
        </figure>

        <div className="px-1">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
            {item.badge}
          </span>
          <h2
            className="mt-4 text-2xl md:text-3xl lg:text-4xl font-bold text-lc-white leading-tight tracking-tight"
            itemProp="name"
          >
            {item.title}
          </h2>
          <p className="mt-4 text-base md:text-lg text-lc-muted leading-relaxed">
            {item.description}
          </p>
          {item.features.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {item.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm md:text-base text-lc-muted">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-lc-green mt-1 shrink-0"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
