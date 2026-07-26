export type Token =
    | { type: "lparen" }
    | { type: "rparen" }
    | { type: "and" }
    | { type: "or" }
    | { type: "not" }
    | { type: "cmp", value: "==" | "!=" | "<=" | ">=" | "<" | ">" }
    | { type: "number", value: number }
    | { type: "string", value: string }
    | { type: "bool", value: boolean }
    | { type: "null" }
    | { type: "path", value: string }
    | { type: "eof" };

const KEYWORDS: Record<string, Token> = {
    "true": { type: "bool", value: true },
    "false": { type: "bool", value: false },
    "null": { type: "null" }
};

/** @returns true for a character a bare (unquoted) path may start or continue with */
function isPathChar(ch: string): boolean {
    return /[A-Za-z0-9_$.]/.test(ch);
}

/**
 * Splits the small boolean-expression grammar of `<mqtt-if expr="…">`
 * (Dagda ROADMAP tranche 4) into tokens. A "path" token is kept as one raw
 * string — `payload.temperature`, `value[0]` — and handed to
 * `resolvePath()` (`path.ts`) at evaluation time rather than parsed twice.
 * @throws on an unterminated string or a character nothing above recognizes.
 */
export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    const peek = (): string | undefined => source[i];

    while (i < source.length) {
        const ch = source[i]!;

        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            i++;
            continue;
        }
        if (ch === "(") { tokens.push({ type: "lparen" }); i++; continue; }
        if (ch === ")") { tokens.push({ type: "rparen" }); i++; continue; }

        if (ch === "&" && source[i + 1] === "&") { tokens.push({ type: "and" }); i += 2; continue; }
        if (ch === "|" && source[i + 1] === "|") { tokens.push({ type: "or" }); i += 2; continue; }

        if (ch === "=" && source[i + 1] === "=") { tokens.push({ type: "cmp", value: "==" }); i += 2; continue; }
        if (ch === "!" && source[i + 1] === "=") { tokens.push({ type: "cmp", value: "!=" }); i += 2; continue; }
        if (ch === "<" && source[i + 1] === "=") { tokens.push({ type: "cmp", value: "<=" }); i += 2; continue; }
        if (ch === ">" && source[i + 1] === "=") { tokens.push({ type: "cmp", value: ">=" }); i += 2; continue; }
        if (ch === "<") { tokens.push({ type: "cmp", value: "<" }); i++; continue; }
        if (ch === ">") { tokens.push({ type: "cmp", value: ">" }); i++; continue; }
        if (ch === "!") { tokens.push({ type: "not" }); i++; continue; }

        if (ch === "\"" || ch === "'") {
            const quote = ch;
            let value = "";
            i++;
            while (i < source.length && peek() !== quote) {
                value += source[i];
                i++;
            }
            if (peek() !== quote) {
                throw new Error(`Unterminated string in expression: "${source}"`);
            }
            i++;
            tokens.push({ type: "string", value });
            continue;
        }

        if (/[0-9]/.test(ch)) {
            let value = "";
            while (i < source.length && /[0-9.]/.test(source[i]!)) {
                value += source[i];
                i++;
            }
            tokens.push({ type: "number", value: Number(value) });
            continue;
        }

        if (/[A-Za-z_$]/.test(ch)) {
            let value = "";
            while (i < source.length && isPathChar(source[i]!)) {
                value += source[i];
                i++;
            }
            const keyword = KEYWORDS[value];
            tokens.push(keyword ?? { type: "path", value });
            continue;
        }

        throw new Error(`Unexpected character "${ch}" in expression: "${source}"`);
    }

    tokens.push({ type: "eof" });
    return tokens;
}
