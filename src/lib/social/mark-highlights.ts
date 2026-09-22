/**
 * Mark highlighted passages inside rendered article text.
 *
 * The article body is markdown rendered to DOM by `MessageContent`, so the
 * passages a highlight refers to don't exist as React nodes we could wrap —
 * they're substrings of text nodes, and a passage can start mid-paragraph.
 * This walks the rendered text and wraps matches in `<mark>`.
 *
 * Two rules keep the surgery safe:
 *
 *  - Only text nodes are touched, never element structure, so images, link
 *    previews and code blocks are left exactly as React built them.
 *  - Marking returns its own undo, which unwraps and re-normalises. Toggling
 *    the feature off restores the DOM instead of forcing a re-render of
 *    content that hasn't changed.
 *
 * Matching is done on normalised whitespace: highlights are copy-pasted
 * text, and clients disagree about trailing newlines and doubled spaces, so
 * an exact match would find nothing most of the time.
 */

export type MarkRun = {
  text: string;
  /** Who highlighted it — surfaced as the mark's tooltip. */
  pubkeys: readonly string[];
};

export const MARK_CLASS = 'article-highlight';

/** Elements whose text is not prose and must not be marked. */
const SKIP = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'MARK', 'TEXTAREA']);

function collectTextNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement;
      if (!parent || SKIP.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    out.push(node as Text);
    node = walker.nextNode();
  }
  return out;
}

/**
 * Find `needle` in `haystack` ignoring whitespace differences.
 * Returns the raw [start, end) offsets in `haystack`, or null.
 */
export function looseIndexOf(haystack: string, needle: string): [number, number] | null {
  const target = needle.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!target) return null;

  // Walk the haystack building a normalised string alongside a map back to
  // raw offsets, so the match can be reported in the original coordinates.
  const offsets: number[] = [];
  let normalised = '';
  let lastWasSpace = true;
  for (let i = 0; i < haystack.length; i += 1) {
    const char = haystack[i];
    if (/\s/.test(char)) {
      if (lastWasSpace) continue;
      lastWasSpace = true;
      normalised += ' ';
      offsets.push(i);
      continue;
    }
    lastWasSpace = false;
    normalised += char.toLowerCase();
    offsets.push(i);
  }

  const at = normalised.indexOf(target);
  if (at === -1) return null;
  const start = offsets[at];
  const endIndex = at + target.length - 1;
  return [start, offsets[endIndex] + 1];
}

/**
 * Wrap every run found in `root`. Returns an undo function.
 *
 * Runs should be supplied longest-first: a passage containing another must
 * be marked before the shorter one, or the inner `<mark>` splits the outer
 * text node and the outer passage stops matching.
 */
export function markHighlights(
  root: HTMLElement,
  runs: readonly MarkRun[],
  onClick?: (run: MarkRun) => void,
): () => void {
  const created: HTMLElement[] = [];

  for (const run of runs) {
    // Re-collect each pass: the previous run may have split these nodes.
    for (const node of collectTextNodes(root)) {
      const text = node.textContent ?? '';
      const found = looseIndexOf(text, run.text);
      if (!found) continue;

      const [start, end] = found;
      const middle = node.splitText(start);
      middle.splitText(end - start);

      const mark = root.ownerDocument.createElement('mark');
      mark.className = MARK_CLASS;
      mark.textContent = middle.textContent;
      mark.dataset.count = String(run.pubkeys.length);
      if (onClick) {
        mark.addEventListener('click', () => onClick(run));
        mark.style.cursor = 'pointer';
      }
      middle.replaceWith(mark);
      created.push(mark);
      break; // One mark per run: the first occurrence is the passage.
    }
  }

  return () => {
    for (const mark of created) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(root.ownerDocument.createTextNode(mark.textContent ?? ''), mark);
      // Re-join the text nodes we split, so a second pass sees the original
      // shape and can match passages that span the old boundary.
      (parent as HTMLElement).normalize?.();
    }
    created.length = 0;
  };
}
