'use client';

import Button from '@/components/ui/buttons/Button';
import { useState } from 'react';
import Heading from '@/components/ui/layout/Heading';

interface Props {
  id: string;
  question: string;
  answer: string;
}

export default function FaqItem({ id, question, answer }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="lc-card overflow-hidden"
      data-testid={`faq-item-${id}`}
    >
      <Button
        variant="bare"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-5 flex items-start justify-between gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60 rounded-xl"
        aria-expanded={open}
        aria-controls={`faq-${id}-answer`}
      >
        <Heading as="h3" className="text-base md:text-[17px] font-semibold text-lc-white pr-4 leading-snug">
          {question}
        </Heading>
        <span
          aria-hidden="true"
          className={`shrink-0 text-lc-green text-2xl leading-none mt-0.5 transition-transform duration-300 ${
            open ? 'rotate-45' : ''
          }`}
        >
          +
        </span>
      </Button>
      <div
        id={`faq-${id}-answer`}
        role="region"
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className="px-6 pb-6 text-[15px] text-lc-muted leading-7"
          >
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}
