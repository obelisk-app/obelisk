import type { LandingStep } from '@/constants/marketing/landing';
import { ChatIcon, KeyIcon, LayersIcon } from '@/assets/icons';

/** The icon beside one "how it works" step: the key, the relay, the chat. */
export default function StepGlyph({ step }: { step: LandingStep }) {
  if (step === 1) return <KeyIcon size={24} strokeWidth={1.5} />;
  if (step === 2) return <LayersIcon size={24} strokeWidth={1.5} />;
  return <ChatIcon size={24} strokeWidth={1.5} />;
}
