// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MARK_CLASS, looseIndexOf, markHighlights } from './mark-highlights';

const root = (html: string): HTMLElement => {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.append(element);
  return element;
};

const marks = (element: HTMLElement) => [...element.querySelectorAll('mark')];

describe('looseIndexOf', () => {
  it('finds a passage across differing whitespace', () => {
    // Highlights are copy-pasted text; clients disagree about newlines and
    // doubled spaces, so an exact match finds nothing most of the time.
    expect(looseIndexOf('one  two\nthree', 'one two three')).toEqual([0, 14]);
  });

  it('is case-insensitive', () => {
    expect(looseIndexOf('The Quick Fox', 'quick fox')).toEqual([4, 13]);
  });

  it('reports offsets in the original string', () => {
    const [start, end] = looseIndexOf('lead in, the passage, tail', 'the passage')!;
    expect('lead in, the passage, tail'.slice(start, end)).toBe('the passage');
  });

  it('returns null when absent, and for an empty needle', () => {
    expect(looseIndexOf('abc', 'xyz')).toBeNull();
    expect(looseIndexOf('abc', '   ')).toBeNull();
  });
});

describe('markHighlights', () => {
  it('wraps the passage without touching element structure', () => {
    const element = root('<p>Before the <em>passage</em> after</p>');
    markHighlights(element, [{ text: 'Before the', pubkeys: ['a'] }]);

    expect(marks(element)[0].textContent).toBe('Before the');
    // The emphasis element React rendered is untouched.
    expect(element.querySelector('em')?.textContent).toBe('passage');
  });

  it('marks across paragraphs, one run at a time', () => {
    const element = root('<p>first para here</p><p>second para here</p>');
    markHighlights(element, [
      { text: 'first para', pubkeys: ['a'] },
      { text: 'second para', pubkeys: ['b'] },
    ]);
    expect(marks(element).map((mark) => mark.textContent)).toEqual(['first para', 'second para']);
  });

  it('carries how many people highlighted it', () => {
    const element = root('<p>a notable sentence</p>');
    markHighlights(element, [{ text: 'a notable sentence', pubkeys: ['a', 'b', 'c'] }]);
    expect(marks(element)[0].dataset.count).toBe('3');
  });

  it('marks one occurrence per run, not every repetition', () => {
    const element = root('<p>repeat repeat repeat</p>');
    markHighlights(element, [{ text: 'repeat', pubkeys: ['a'] }]);
    expect(marks(element)).toHaveLength(1);
  });

  it('never marks inside code, which is not prose', () => {
    const element = root('<pre><code>const passage = 1</code></pre>');
    markHighlights(element, [{ text: 'const passage', pubkeys: ['a'] }]);
    expect(marks(element)).toHaveLength(0);
  });

  it('undoes itself, restoring the original text', () => {
    // Toggling off must restore the DOM rather than force a re-render of
    // content that has not changed.
    const element = root('<p>Before the passage after</p>');
    const before = element.innerHTML;
    const undo = markHighlights(element, [{ text: 'the passage', pubkeys: ['a'] }]);
    expect(marks(element)).toHaveLength(1);

    undo();
    expect(marks(element)).toHaveLength(0);
    expect(element.innerHTML).toBe(before);
  });

  it('can mark again after an undo, including across the old split', () => {
    const element = root('<p>one two three four</p>');
    const undo = markHighlights(element, [{ text: 'two three', pubkeys: ['a'] }]);
    undo();

    markHighlights(element, [{ text: 'one two three four', pubkeys: ['b'] }]);
    expect(marks(element)[0].textContent).toBe('one two three four');
  });

  it('marks the longer passage first so nesting does not break it', () => {
    // Marking the inner one first splits the outer text node, and the outer
    // passage then never matches.
    const element = root('<p>a short piece inside a longer passage here</p>');
    markHighlights(element, [
      { text: 'a short piece inside a longer passage here', pubkeys: ['a'] },
      { text: 'a short piece', pubkeys: ['b'] },
    ]);
    expect(marks(element)[0].textContent).toBe('a short piece inside a longer passage here');
  });

  it('reports a click on a mark', () => {
    const element = root('<p>click this passage</p>');
    const onClick = vi.fn();
    const run = { text: 'this passage', pubkeys: ['a'] };
    markHighlights(element, [run], onClick);

    marks(element)[0].click();
    expect(onClick).toHaveBeenCalledWith(run);
  });

  it('ignores a run that is not in the text', () => {
    const element = root('<p>nothing to see</p>');
    expect(() => markHighlights(element, [{ text: 'absent passage', pubkeys: ['a'] }])).not.toThrow();
    expect(marks(element)).toHaveLength(0);
  });

  it('tags marks with a class the stylesheet can find', () => {
    const element = root('<p>styled passage</p>');
    markHighlights(element, [{ text: 'styled passage', pubkeys: ['a'] }]);
    expect(marks(element)[0].className).toBe(MARK_CLASS);
  });
});
