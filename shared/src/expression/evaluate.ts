import { Expr, parse } from "./parser";
import { resolvePath } from "./path";

/**
 * What an expression is evaluated against — the same four names in every
 * consumer (`<mqtt-if expr="…">` today, tranche 6's trigger filters
 * tomorrow), settled now rather than let each caller invent its own:
 *
 * - `payload` — the parsed JSON payload of the message (or the raw string,
 *   if it did not parse as JSON);
 * - `value` — `payload` again, under a shorter name for the common case of
 *   a payload that is itself the value (a bare number or string, not an
 *   object);
 * - `topic` — the full topic name;
 * - `previous` — the same shape as `payload`, for the message before this
 *   one — what a trigger filter needs to answer "did the value change"
 *   (FEATURES §5.2), settled here so the scope shape doesn't need to change
 *   when tranche 6 actually consumes it;
 * - `now` — milliseconds since the epoch, read at evaluation time.
 */
export interface ExpressionScope {
    payload: unknown;
    value: unknown;
    topic: string;
    previous: unknown;
    now: number;
}

/** A parsed, cached expression, ready to evaluate against any scope */
export type CompiledExpression = (scope: ExpressionScope) => boolean;

const cache = new Map<string, Expr>();

/**
 * Parses `source` once — cached by the literal source string, since the
 * same `expr="…"` attribute is evaluated on every message a component
 * receives — and returns a function evaluating it against a scope.
 * @throws if `source` does not match the grammar (`parser.ts`) — at
 * component-attribute-read time, deliberately, not swallowed into `false`:
 * an author typo in `expr=` should be loud, unlike a data-side miss (a
 * missing field resolves to `undefined`, not an error — see `evaluate()`).
 */
export function compile(source: string): CompiledExpression {
    let ast = cache.get(source);
    if (ast == null) {
        ast = parse(source);
        cache.set(source, ast);
    }
    const compiled = ast;
    return (scope: ExpressionScope) => toBoolean(evaluate(compiled, scope));
}

/** Parses and evaluates in one call — for a one-off, uncached use */
export function evaluateExpression(source: string, scope: ExpressionScope): boolean {
    return compile(source)(scope);
}

function evaluate(expr: Expr, scope: ExpressionScope): unknown {
    switch (expr.type) {
        case "literal":
            return expr.value;
        case "path":
            return resolvePath(scope, expr.path);
        case "not":
            return !toBoolean(evaluate(expr.operand, scope));
        case "and":
            return toBoolean(evaluate(expr.left, scope)) && toBoolean(evaluate(expr.right, scope));
        case "or":
            return toBoolean(evaluate(expr.left, scope)) || toBoolean(evaluate(expr.right, scope));
        case "cmp":
            return compare(expr.op, evaluate(expr.left, scope), evaluate(expr.right, scope));
    }
}

function compare(op: "==" | "!=" | "<=" | ">=" | "<" | ">", left: unknown, right: unknown): boolean {
    switch (op) {
        // null and undefined compare equal to each other: `payload.missing`
        // resolves to undefined, and an author writing `== null` means "is
        // this absent", not "was JSON.parse asked to store an actual null".
        // Otherwise strict — no numeric-string coercion, no other surprise.
        case "==": return equals(left, right);
        case "!=": return !equals(left, right);
        // Ordering only makes sense between two numbers or two strings — a
        // mismatched or unresolved (undefined) comparison reads as false
        // rather than throwing, same "a miss is not an error" posture as
        // resolvePath() itself.
        case "<": case "<=": case ">": case ">=": {
            const ordered = asOrderablePair(left, right);
            if (ordered == null) {
                return false;
            }
            const [a, b] = ordered;
            switch (op) {
                case "<": return a < b;
                case "<=": return a <= b;
                case ">": return a > b;
                case ">=": return a >= b;
            }
        }
    }
}

function equals(left: unknown, right: unknown): boolean {
    if (left == null || right == null) {
        return left == null && right == null;
    }
    return left === right;
}

function asOrderablePair(left: unknown, right: unknown): [number, number] | [string, string] | null {
    if (typeof left === "number" && typeof right === "number") {
        return [left, right];
    }
    if (typeof left === "string" && typeof right === "string") {
        return [left, right];
    }
    return null;
}

/** Loose enough to accept a bare payload value directly, strict about the one thing that always trips people up: the string "false" is truthy in JS, and never should be here */
function toBoolean(value: unknown): boolean {
    if (typeof value === "string") {
        return value.length > 0 && value !== "false" && value !== "0";
    }
    return Boolean(value);
}
