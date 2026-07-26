import { Token, tokenize } from "./lexer";

export type Expr =
    | { type: "literal", value: string | number | boolean | null }
    | { type: "path", path: string }
    | { type: "not", operand: Expr }
    | { type: "and", left: Expr, right: Expr }
    | { type: "or", left: Expr, right: Expr }
    | { type: "cmp", op: "==" | "!=" | "<=" | ">=" | "<" | ">", left: Expr, right: Expr };

/**
 * Recursive-descent parser for the small boolean-expression grammar of
 * `<mqtt-if expr="…">` (Dagda ROADMAP tranche 4), deliberately this small —
 * no function calls, no arithmetic, no regex, no ternary, no assignment:
 *
 * ```
 * expr    := or
 * or      := and ("||" and)*
 * and     := cmp ("&&" cmp)*
 * cmp     := unary (("==" | "!=" | "<" | "<=" | ">" | ">=") unary)?
 * unary   := "!" unary | primary
 * primary := number | string | "true" | "false" | "null" | path | "(" expr ")"
 * ```
 */
class Parser {

    private _position = 0;

    constructor(private readonly _tokens: Token[]) { }

    public parse(): Expr {
        const expr = this._or();
        this._expect("eof");
        return expr;
    }

    private _or(): Expr {
        let left = this._and();
        while (this._peek().type === "or") {
            this._advance();
            left = { type: "or", left, right: this._and() };
        }
        return left;
    }

    private _and(): Expr {
        let left = this._cmp();
        while (this._peek().type === "and") {
            this._advance();
            left = { type: "and", left, right: this._cmp() };
        }
        return left;
    }

    private _cmp(): Expr {
        const left = this._unary();
        const token = this._peek();
        if (token.type === "cmp") {
            this._advance();
            return { type: "cmp", op: token.value, left, right: this._unary() };
        }
        return left;
    }

    private _unary(): Expr {
        if (this._peek().type === "not") {
            this._advance();
            return { type: "not", operand: this._unary() };
        }
        return this._primary();
    }

    private _primary(): Expr {
        const token = this._advance();
        switch (token.type) {
            case "number":
                return { type: "literal", value: token.value };
            case "string":
                return { type: "literal", value: token.value };
            case "bool":
                return { type: "literal", value: token.value };
            case "null":
                return { type: "literal", value: null };
            case "path":
                return { type: "path", path: token.value };
            case "lparen": {
                const inner = this._or();
                this._expect("rparen");
                return inner;
            }
            default:
                throw new Error(`Unexpected token "${token.type}" in expression`);
        }
    }

    private _peek(): Token {
        return this._tokens[this._position]!;
    }

    private _advance(): Token {
        return this._tokens[this._position++]!;
    }

    private _expect(type: Token["type"]): void {
        const token = this._advance();
        if (token.type !== type) {
            throw new Error(`Expected "${type}" but got "${token.type}" in expression`);
        }
    }

}

/** @throws if `source` does not match the grammar */
export function parse(source: string): Expr {
    return new Parser(tokenize(source)).parse();
}
