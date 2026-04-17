'use client';

import { useState } from 'react';

interface Props {
  id: string;
  question: string;
  answer: string;
}

export default function FAQItem({ id, question, answer }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="lc-card overflow-hidden"
      data-testid={`faq-item-${id}`}
      itemScope
      itemProp="mainEntity"
      itemType="https://schema.org/Question"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-5 flex items-start justify-between gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60 rounded-xl"
        aria-expanded={open}
        aria-controls={`faq-${id}-answer`}
      >
        <h3
          className="text-base md:text-[17px] font-semibold text-lc-white pr-4 leading-snug"
          itemProp="name"
        >
          {question}
        </h3>
        <span
          aria-hidden="true"
          className={`shrink-0 text-lc-green text-2xl leading-none mt-0.5 transition-transform duration-300 ${
            open ? 'rotate-45' : ''
          }`}
        >
          +
        </span>
      </button>
      <div
        id={`faq-${id}-answer`}
        role="region"
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        itemScope
        itemProp="acceptedAnswer"
        itemType="https://schema.org/Answer"
      >
        <div className="overflow-hidden">
          <div
            className="px-6 pb-6 text-[15px] text-lc-muted leading-7"
            itemProp="text"
          >
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}
