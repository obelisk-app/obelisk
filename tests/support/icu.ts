import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

/**
 * The ICU arguments and tags a message uses, as sorted `name:kind` strings
 * (`count:plural`, `name:arg`, `tag:tag`), parsed rather than matched with
 * a regex so plural branches and nested tags count.
 */
export function icuArguments(message: string): string[] {
  const out = new Set<string>();
  const walk = (nodes: MessageFormatElement[]) => {
    for (const n of nodes) {
      if (n.type === TYPE.argument) out.add(`${n.value}:arg`);
      else if (n.type === TYPE.number) out.add(`${n.value}:number`);
      else if (n.type === TYPE.date || n.type === TYPE.time) out.add(`${n.value}:date`);
      else if (n.type === TYPE.plural) {
        out.add(`${n.value}:plural`);
        for (const o of Object.values(n.options)) walk(o.value);
      } else if (n.type === TYPE.select) {
        out.add(`${n.value}:select`);
        for (const o of Object.values(n.options)) walk(o.value);
      } else if (n.type === TYPE.tag) {
        out.add(`${n.value}:tag`);
        walk(n.children);
      }
    }
  };
  walk(parse(message));
  return [...out].sort();
}

/** Argument names a call must supply (tags included: `t.rich` needs them). */
export function requiredValues(message: string): string[] {
  return [...new Set(icuArguments(message).map((a) => a.split(':')[0]))].sort();
}
