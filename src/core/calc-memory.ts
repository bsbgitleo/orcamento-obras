// src/core/calc-memory.ts
// Memória de cálculo dos quantitativos (decisões #80–#83): parâmetros com
// sigla, valor digitado ou fórmula com as siglas dos outros parâmetros.
//
//   fórmula   números (1,5 ou 1.5), siglas, + − * / ^ (× também multiplica),
//             parênteses e funções; argumentos separados por ";":
//             ARRED / ROUND (x; casas), ARREDONDAR.PARA.CIMA / ROUNDUP,
//             ARREDONDAR.PARA.BAIXO / ROUNDDOWN, TRUNCAR / TRUNC, MÁXIMO / MAX,
//             MÍNIMO / MIN, SOMA / SUM, ABS, RAIZ / SQRT
//   avaliação em decimal (decimal.js), na ordem das dependências; referência
//             circular, sigla inexistente, divisão por zero e erro de sintaxe
//             ficam apontados no parâmetro (e em quem depende dele).
//   Excel     a mesma fórmula, com as siglas trocadas pelas células da coluna
//             de valor ($C$12) e as funções em inglês (o Excel traduz).
import Decimal from "decimal.js";

export const CODE_RE = /^[A-Za-z][A-Za-z0-9_]{0,11}$/;
export const normCode = (s: string) => s.trim().toUpperCase();

type Tok =
  | { t: "num"; v: Decimal; raw: string }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { t: "("; } | { t: ")" } | { t: ";" };

const FUNCS: Record<string, { excel: string; min: number; max: number }> = {
  ROUND: { excel: "ROUND", min: 1, max: 2 }, ARRED: { excel: "ROUND", min: 1, max: 2 },
  ROUNDUP: { excel: "ROUNDUP", min: 1, max: 2 }, "ARREDONDAR.PARA.CIMA": { excel: "ROUNDUP", min: 1, max: 2 },
  ROUNDDOWN: { excel: "ROUNDDOWN", min: 1, max: 2 }, "ARREDONDAR.PARA.BAIXO": { excel: "ROUNDDOWN", min: 1, max: 2 },
  TRUNC: { excel: "TRUNC", min: 1, max: 2 }, TRUNCAR: { excel: "TRUNC", min: 1, max: 2 },
  MAX: { excel: "MAX", min: 1, max: 99 }, MAXIMO: { excel: "MAX", min: 1, max: 99 },
  MIN: { excel: "MIN", min: 1, max: 99 }, MINIMO: { excel: "MIN", min: 1, max: 99 },
  SUM: { excel: "SUM", min: 1, max: 99 }, SOMA: { excel: "SUM", min: 1, max: 99 },
  ABS: { excel: "ABS", min: 1, max: 1 }, SQRT: { excel: "SQRT", min: 1, max: 1 }, RAIZ: { excel: "SQRT", min: 1, max: 1 },
};
const funcKey = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export class FormulaError extends Error {}

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/×/g, "*").replace(/−/g, "-").replace(/÷/g, "/");
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || ((c === "," || c === ".") && /[0-9]/.test(s[i + 1] ?? ""))) {
      const m = /^[0-9]*(?:[.,][0-9]+)?/.exec(s.slice(i))![0];
      out.push({ t: "num", v: new Decimal(m.replace(",", ".")), raw: m });
      i += m.length; continue;
    }
    if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      const m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(s.slice(i))![0];
      out.push({ t: "id", v: m }); i += m.length; continue;
    }
    if ("+-*/^".includes(c)) { out.push({ t: "op", v: c as "+" }); i++; continue; }
    if (c === "(" || c === ")" || c === ";") { out.push({ t: c } as Tok); i++; continue; }
    throw new FormulaError(`caractere inválido: "${c}"`);
  }
  return out;
}

type Node =
  | { k: "num"; v: Decimal; raw: string }
  | { k: "ref"; code: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] }
  | { k: "paren"; a: Node };

// Parser descendente: expressão = termo (+ ou − termo)…; termo = potência (× ou ÷ potência)…; potência = unário (^ potência)
export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const expect = (t: Tok["t"]) => { if (peek()?.t !== t) throw new FormulaError(t === ")" ? "falta fechar parêntese" : `esperava "${t}"`); p++; };
  const expr = (): Node => {
    let a = term();
    while (peek()?.t === "op" && ["+", "-"].includes((peek() as { v: string }).v)) { const op = (toks[p++] as { v: "+" }).v; a = { k: "bin", op, a, b: term() }; }
    return a;
  };
  const term = (): Node => {
    let a = power();
    while (peek()?.t === "op" && ["*", "/"].includes((peek() as { v: string }).v)) { const op = (toks[p++] as { v: "*" }).v; a = { k: "bin", op, a, b: power() }; }
    return a;
  };
  const power = (): Node => {
    const a = unary();
    if (peek()?.t === "op" && (peek() as { v: string }).v === "^") { p++; return { k: "bin", op: "^", a, b: power() }; }
    return a;
  };
  const unary = (): Node => {
    if (peek()?.t === "op" && (peek() as { v: string }).v === "-") { p++; return { k: "neg", a: unary() }; }
    if (peek()?.t === "op" && (peek() as { v: string }).v === "+") { p++; return unary(); }
    return primary();
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new FormulaError("fórmula incompleta");
    if (t.t === "num") { p++; return { k: "num", v: t.v, raw: t.raw }; }
    if (t.t === "(") { p++; const a = expr(); expect(")"); return { k: "paren", a }; }
    if (t.t === "id") {
      p++;
      if (peek()?.t === "(") {
        const fn = FUNCS[funcKey(t.v)];
        if (!fn) throw new FormulaError(`função desconhecida: ${t.v}`);
        p++;
        const args: Node[] = [];
        if (peek()?.t !== ")") { args.push(expr()); while (peek()?.t === ";") { p++; args.push(expr()); } }
        expect(")");
        if (args.length < fn.min || args.length > fn.max) throw new FormulaError(`${t.v}: número de argumentos inválido`);
        return { k: "call", fn: funcKey(t.v), args };
      }
      if (!CODE_RE.test(t.v)) throw new FormulaError(`sigla inválida: ${t.v}`);
      return { k: "ref", code: normCode(t.v) };
    }
    throw new FormulaError("expressão inválida");
  };
  if (!toks.length) throw new FormulaError("fórmula vazia");
  const node = expr();
  if (p < toks.length) throw new FormulaError(toks[p].t === ";" ? "use ; só entre argumentos de função" : "expressão inválida depois do fim");
  return node;
}

export function references(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case "ref": out.add(node.code); break;
    case "neg": case "paren": references(node.a, out); break;
    case "bin": references(node.a, out); references(node.b, out); break;
    case "call": node.args.forEach((a) => references(a, out)); break;
  }
  return out;
}

const roundTo = (x: Decimal, n: Decimal, mode: Decimal.Rounding) => {
  const places = n.toNumber();
  if (!Number.isInteger(places)) throw new FormulaError("o número de casas deve ser inteiro");
  if (places >= 0) return x.toDecimalPlaces(places, mode);
  const f = new Decimal(10).pow(-places);
  return x.div(f).toDecimalPlaces(0, mode).times(f);
};

function evaluate(node: Node, get: (code: string) => Decimal): Decimal {
  switch (node.k) {
    case "num": return node.v;
    case "ref": return get(node.code);
    case "paren": return evaluate(node.a, get);
    case "neg": return evaluate(node.a, get).neg();
    case "bin": {
      const a = evaluate(node.a, get), b = evaluate(node.b, get);
      if (node.op === "+") return a.plus(b);
      if (node.op === "-") return a.minus(b);
      if (node.op === "*") return a.times(b);
      if (node.op === "/") { if (b.isZero()) throw new FormulaError("divisão por zero"); return a.div(b); }
      return a.pow(b);
    }
    case "call": {
      const v = node.args.map((a) => evaluate(a, get));
      const n = v[1] ?? new Decimal(0);
      switch (FUNCS[node.fn].excel) {
        case "ROUND": return roundTo(v[0], n, Decimal.ROUND_HALF_UP);
        // como no Excel: para cima/baixo em valor absoluto
        case "ROUNDUP": return roundTo(v[0], n, Decimal.ROUND_UP);
        case "ROUNDDOWN": case "TRUNC": return roundTo(v[0], n, Decimal.ROUND_DOWN);
        case "MAX": return Decimal.max(...v);
        case "MIN": return Decimal.min(...v);
        case "SUM": return v.reduce((a, b) => a.plus(b), new Decimal(0));
        case "ABS": return v[0].abs();
        case "SQRT": if (v[0].lt(0)) throw new FormulaError("raiz de número negativo"); return v[0].sqrt();
      }
      throw new FormulaError("função desconhecida");
    }
  }
}

export interface MemoryParam { code: string; value: string | null; formula: string | null }
export interface MemoryResult { value: Decimal | null; error: string | null }

/** Avalia todos os parâmetros; o resultado de cada sigla traz o valor ou o erro. */
export function evaluateMemory(params: MemoryParam[]): Map<string, MemoryResult> {
  const byCode = new Map(params.map((p) => [normCode(p.code), p]));
  const out = new Map<string, MemoryResult>();
  const parsed = new Map<string, Node | FormulaError>();
  for (const p of params) {
    if (!p.formula?.trim()) continue;
    try { parsed.set(normCode(p.code), parseFormula(p.formula)); } catch (e) { parsed.set(normCode(p.code), e instanceof FormulaError ? e : new FormulaError("fórmula inválida")); }
  }
  const visiting = new Set<string>();
  const resolve = (code: string): Decimal => {
    const done = out.get(code);
    if (done) { if (done.error) throw new FormulaError(`depende de ${code}, que tem erro`); return done.value!; }
    const p = byCode.get(code);
    if (!p) throw new FormulaError(`sigla inexistente: ${code}`);
    if (visiting.has(code)) throw new FormulaError(`referência circular em ${code}`);
    visiting.add(code);
    try {
      const node = parsed.get(code);
      let v: Decimal;
      if (node instanceof FormulaError) throw node;
      if (node) v = evaluate(node, resolve);
      else if (p.value !== null && /^-?\d+([.,]\d+)?$/.test(p.value.trim())) v = new Decimal(p.value.trim().replace(",", "."));
      else throw new FormulaError("sem valor");
      out.set(code, { value: v, error: null });
      return v;
    } catch (e) {
      const msg = e instanceof FormulaError ? e.message : "erro no cálculo";
      if (!out.has(code)) out.set(code, { value: null, error: msg });
      throw new FormulaError(msg.startsWith("depende de") || msg.startsWith("referência circular") ? msg : `depende de ${code}, que tem erro`);
    } finally {
      visiting.delete(code);
    }
  };
  for (const code of byCode.keys()) { if (!out.has(code)) { try { resolve(code); } catch { /* registrado */ } } }
  return out;
}

/** Fórmula para o Excel: siglas → células ($C$n), funções em inglês, "," entre argumentos, "." decimal. */
export function toExcelFormula(src: string, cellOf: (code: string) => string | null): string | null {
  let node: Node;
  try { node = parseFormula(src); } catch { return null; }
  let ok = true;
  const w = (n: Node): string => {
    switch (n.k) {
      case "num": return n.v.toString();
      case "ref": { const c = cellOf(n.code); if (!c) ok = false; return c ?? "0"; }
      case "paren": return `(${w(n.a)})`;
      case "neg": return `-${w(n.a)}`;
      case "bin": return `${w(n.a)}${n.op}${w(n.b)}`;
      case "call": {
        const f = FUNCS[n.fn].excel;
        const args = n.args.map(w);
        if ((f === "ROUND" || f === "ROUNDUP" || f === "ROUNDDOWN") && args.length === 1) args.push("0");
        return `${f}(${args.join(",")})`;
      }
    }
  };
  const out = w(node);
  return ok ? out : null;
}
