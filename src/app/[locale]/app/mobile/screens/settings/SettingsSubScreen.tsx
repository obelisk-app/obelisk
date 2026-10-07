'use client';

import type { ReactNode } from 'react';
import BackButton from '../../chrome/BackButton';

/** A preferences sub-screen: a back button and title over its own settings body. */
export function SettingsSubScreen({
  screen,
  title,
  onBack,
  backTestId,
  children,
}: {
  screen: string;
  title: string;
  onBack: () => void;
  backTestId?: string;
  children: ReactNode;
}) {
  return (
    <div className="screen active" data-screen={screen}>
      <div className="app-header">
        <BackButton onClick={onBack} data-testid={backTestId} />
        <h2>{title}</h2>
      </div>
      <div className="settings-body">
        {children}
      </div>
    </div>
  );
}
