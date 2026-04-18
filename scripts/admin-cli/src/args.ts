// Minimal argv parser — positionals + --flag / --flag value / --flag=value.
export type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[body] = next;
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else {
      positional.push(tok);
    }
  }
  return { positional, flags };
}

export function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

export function requireFlag(flags: Record<string, string | boolean>, name: string): string {
  const v = flagString(flags, name);
  if (!v) throw new Error(`Missing required flag --${name}`);
  return v;
}
