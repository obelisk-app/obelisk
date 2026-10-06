import type { ReactNode } from 'react';
import { cn } from '@/utils/style/cn';
import UserAvatar from './UserAvatar';

/** `sm` is the 28px avatar of dense pickers; `md` the 32px of member lists. */
export type UserRowSize = 'sm' | 'md';
/** `selected` is the picked row in a list you choose from (search, forward, mention). */
export type UserRowState = 'idle' | 'selected';

const AVATAR_SCALE: Record<UserRowSize, number> = { sm: 7, md: 8 };

export interface UserRowProps {
  pubkey: string;
  picture: string | null | undefined;
  /** Already resolved for display (`displayNameFor`); never raw hex. */
  name: string;
  /** One muted line under the name: a NIP-05, a short npub, a role. */
  meta?: ReactNode;
  /** Controls at the end of the row (a badge, a button). */
  trailing?: ReactNode;
  size?: UserRowSize;
  state?: UserRowState;
  /** Makes the whole row one button. Leave unset when `trailing` holds the controls. */
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}

/**
 * Avatar, name, muted meta, trailing: the person row nine places wrote by
 * hand, on top of `UserAvatar` and its single fallback recipe.
 */
export default function UserRow({
  pubkey,
  picture,
  name,
  meta,
  trailing,
  size = 'md',
  state = 'idle',
  onClick,
  className,
  'data-testid': testId,
}: UserRowProps) {
  const body = (
    <>
      <UserAvatar pubkey={pubkey} picture={picture} size={AVATAR_SCALE[size]} name={name} alt="" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-lc-white">{name}</span>
        {meta !== undefined && <span className="block truncate text-[11px] text-lc-muted">{meta}</span>}
      </span>
    </>
  );
  const rowClass = cn(
    'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left',
    state === 'selected' && 'bg-lc-green/15',
    className,
  );
  if (onClick) {
    return (
      <div className={rowClass} data-testid={testId}>
        <button
          type="button"
          onClick={onClick}
          aria-current={state === 'selected' ? true : undefined}
          className="-mx-2 -my-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-lc-card focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60"
        >
          {body}
        </button>
        {trailing}
      </div>
    );
  }
  return (
    <div className={rowClass} data-testid={testId}>
      {body}
      {trailing}
    </div>
  );
}
