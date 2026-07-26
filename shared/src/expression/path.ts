/**
 * Extracts a value from a JSON-shaped structure by a dotted/bracket path —
 * `a.b`, `a[0]`, `a["with space"]`, an optional leading `$` or `$.` (both
 * accepted, both mean "the root"). This is what retires `new Function()` in
 * `<mqtt-json>`/`<mqtt-if>` (Dagda ROADMAP tranche 4, FEATURES §6.1): the
 * only thing those two components actually needed `new Function()` for was
 * this, and evaluating arbitrary JavaScript to get it was never the point.
 *
 * Never throws: a malformed path or a miss both read as `undefined`, same
 * philosophy as optional chaining — a dashboard cell showing nothing beats
 * a dashboard that dies because one payload didn't have the field a widget
 * expected.
 */
export function resolvePath(root: unknown, path: string): unknown {
    try {
        let current: unknown = root;
        for (const token of tokenizePath(path)) {
            if (current == null || typeof current !== "object") {
                return undefined;
            }
            current = (current as Record<string, unknown>)[token];
        }
        return current;
    } catch {
        return undefined;
    }
}

/**
 * @returns the path split into plain string segments — `"a.b[0]"` becomes
 * `["a", "b", "0"]`. Exported mainly so the expression parser (`parser.ts`)
 * can reuse the exact same syntax for a path appearing inside an expression,
 * rather than a second, subtly different grammar for it.
 * @throws on an unbalanced `[` — caught by `resolvePath` above, but not
 * swallowed here, so a caller that wants to validate a path up front (an
 * editor's live-preview, say) can tell a malformed path from an empty one.
 */
export function tokenizePath(path: string): string[] {
    let normalized = path.trim();
    if (normalized.startsWith("$")) {
        normalized = normalized.slice(1);
        if (normalized.startsWith(".")) {
            normalized = normalized.slice(1);
        }
    }

    const tokens: string[] = [];
    let current = "";
    const flush = (): void => {
        if (current.length > 0) {
            tokens.push(current);
            current = "";
        }
    };

    let i = 0;
    while (i < normalized.length) {
        const ch = normalized[i];
        if (ch === ".") {
            flush();
            i++;
        } else if (ch === "[") {
            flush();
            const close = normalized.indexOf("]", i);
            if (close === -1) {
                throw new Error(`Unbalanced "[" in path "${path}"`);
            }
            let inner = normalized.slice(i + 1, close).trim();
            if (inner.length >= 2 && ((inner.startsWith("\"") && inner.endsWith("\"")) || (inner.startsWith("'") && inner.endsWith("'")))) {
                inner = inner.slice(1, -1);
            }
            tokens.push(inner);
            i = close + 1;
        } else {
            current += ch;
            i++;
        }
    }
    flush();
    return tokens;
}
