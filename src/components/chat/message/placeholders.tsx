import type { ReactNode } from 'react';
import { MENTION_PLACEHOLDER_REGEX, EVERYONE_PLACEHOLDER, type MentionData } from '@/utils/message-text/markdown';
import { customEmojiPlaceholderRegex } from '@/utils/message-text/emoji-shortcodes';
import { CustomEmojiImg, EveryoneChip, MentionChip } from './MentionChips';

export type MentionMap = Map<string, MentionData>;

/**
 * Swap mention + custom-emoji placeholders in a text string with their
 * respective components. Both placeholder kinds coexist in the same string
 * so we need a single scanning pass that picks whichever token appears next
 * at each step.
 */
export function renderWithMentions(
  text: string,
  mentions: MentionMap,
  serverEmojis: Record<string, string>,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let idx = 0;
  let i = 0;
  const len = text.length;
  while (i < len) {
    // Scan for the next `〈` which is our shared placeholder prefix marker.
    const start = text.indexOf('〈', i);
    if (start === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (start > i) parts.push(text.slice(i, start));

    // @everyone broadcast: 〈EVERYONE〉
    if (text.startsWith(EVERYONE_PLACEHOLDER, start)) {
      parts.push(<EveryoneChip key={`ev-${idx++}-${start}`} />);
      i = start + EVERYONE_PLACEHOLDER.length;
      continue;
    }

    // Mention: 〈MENTION:<key>〉
    MENTION_PLACEHOLDER_REGEX.lastIndex = start;
    const mm = MENTION_PLACEHOLDER_REGEX.exec(text);
    if (mm && mm.index === start) {
      const mentionData = mentions.get(mm[1]);
      if (mentionData) {
        parts.push(
          <MentionChip
            key={`m-${idx++}-${mm[1]}`}
            pubkey={mentionData.pubkey}
            displayName={mentionData.displayName}
          />,
        );
      }
      i = start + mm[0].length;
      continue;
    }

    // Custom emoji: 〈EMOJI:<name>〉
    // Own matcher: a shared one leaked its `lastIndex` into DmMessageBody.
    const emojiRe = customEmojiPlaceholderRegex();
    emojiRe.lastIndex = start;
    const em = emojiRe.exec(text);
    if (em && em.index === start) {
      const name = em[1];
      const url = serverEmojis[name];
      if (url) {
        parts.push(<CustomEmojiImg key={`e-${idx++}-${name}`} name={name} url={url} />);
      } else {
        // Emoji no longer exists on this server: fall back to the raw `:name:`
        parts.push(`:${name}:`);
      }
      i = start + em[0].length;
      continue;
    }

    // Lone `〈` that doesn't match either placeholder: emit verbatim and
    // advance by one to avoid an infinite loop.
    parts.push('〈');
    i = start + 1;
  }

  return parts.length > 0 ? parts : [text];
}

function hasPlaceholder(s: string): boolean {
  return s.includes('〈MENTION:') || s.includes('〈EMOJI:') || s.includes(EVERYONE_PLACEHOLDER);
}

/**
 * Process React children, replacing string nodes that contain mention or
 * custom-emoji placeholders with their corresponding components.
 */
export function processChildren(
  children: ReactNode,
  mentions: MentionMap,
  serverEmojis: Record<string, string>,
): ReactNode {
  if (typeof children === 'string') {
    if (hasPlaceholder(children)) {
      return renderWithMentions(children, mentions, serverEmojis);
    }
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string' && hasPlaceholder(child)) {
        return <span key={i}>{renderWithMentions(child, mentions, serverEmojis)}</span>;
      }
      return child;
    });
  }

  return children;
}
