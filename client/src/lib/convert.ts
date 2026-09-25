import { parse as parseYamlText, stringify as stringifyYaml } from "yaml";
import { parse as parseTomlText } from "smol-toml";

export type Format = "json" | "yaml" | "toml" | "xml" | "csv" | "sql";
export type Detected = Format | "unknown";

export const FORMATS: Format[] = ["json", "yaml", "toml", "xml", "csv", "sql"];

export const FORMAT_LABELS: Record<Format, string> = {
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  csv: "CSV",
  sql: "SQL",
};

export type ParseResult = { ok: boolean; value?: unknown; error?: string };
export type ConvertResult = { ok: boolean; output?: string; error?: string };

// ---------------------------------------------------------------------------
// Format detection (heuristics)
// ---------------------------------------------------------------------------

function splitCsvLine(line: string, delim: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function looksLikeCsv(lines: string[]): boolean {
  for (const delim of [",", ";", "\t"]) {
    const counts = lines.map((l) => splitCsvLine(l, delim).length);
    if (counts[0] > 1 && counts.every((c) => c === counts[0])) return true;
  }
  return false;
}

export function detectFormat(text: string): Detected {
  const t = text.trim();
  if (!t) return "unknown";
  if (t.startsWith("<")) return "xml";
  if (t.startsWith("{")) return "json";
  if (t.startsWith("[")) {
    // JSON array vs TOML [section]
    if (/^\[\s*[[{"\d-]/.test(t) || /^\[\s*(true|false|null)\b/.test(t)) return "json";
    return "toml";
  }
  if (/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|CREATE\s+TABLE)\b/i.test(t)) return "sql";
  if (/^\s*\[[^\]\n]+\]\s*$/m.test(t) && /^\s*[A-Za-z0-9_-]+\s*=/m.test(t)) return "toml";
  if (/^\s*[A-Za-z0-9_-]+\s*=[^=]/m.test(t)) return "toml";
  const lines = t.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length >= 2 && looksLikeCsv(lines)) return "csv";
  if (/^\s*[A-Za-z0-9_.-]+\s*:/m.test(t)) return "yaml";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseJsonFriendly(text: string): ParseResult {
  const candidate = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    const posMatch = message.match(/position\s+(\d+)/i);
    if (posMatch) {
      const pos = Number(posMatch[1]);
      const before = candidate.slice(Math.max(0, pos - 40), pos).replace(/\n/g, "⏎");
      const after = candidate.slice(pos, pos + 40).replace(/\n/g, "⏎");
      return { ok: false, error: `${message}\n...${before}<here>${after}...` };
    }
    return { ok: false, error: message };
  }
}

export function parseYaml(text: string): ParseResult {
  try {
    return { ok: true, value: parseYamlText(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : "Invalid YAML" };
  }
}

export function parseToml(text: string): ParseResult {
  try {
    return { ok: true, value: parseTomlText(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : "Invalid TOML" };
  }
}

function xmlNodeToObject(el: Element): unknown {
  const obj: Record<string, unknown> = {};
  for (const attr of Array.from(el.attributes)) {
    obj[`@${attr.name}`] = attr.value;
  }
  const children = Array.from(el.children);
  const text = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();
  if (children.length === 0) {
    if (Object.keys(obj).length === 0) return text;
    if (text) obj["#text"] = text;
    return obj;
  }
  for (const child of children) {
    const name = child.tagName;
    const val = xmlNodeToObject(child);
    if (name in obj) {
      if (!Array.isArray(obj[name])) obj[name] = [obj[name]];
      (obj[name] as unknown[]).push(val);
    } else {
      obj[name] = val;
    }
  }
  if (text) obj["#text"] = text;
  return obj;
}

export function parseXml(text: string): ParseResult {
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const errNode = doc.querySelector("parsererror");
    if (errNode) {
      const msg = (errNode.textContent ?? "Invalid XML").replace(/\s+/g, " ").slice(0, 220);
      return { ok: false, error: msg };
    }
    const root = doc.documentElement;
    return { ok: true, value: { [root.tagName]: xmlNodeToObject(root) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid XML" };
  }
}

export function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "CSV needs at least a header row and one data row." };
  }
  let delim = ",";
  for (const d of [",", ";", "\t"]) {
    const counts = lines.map((l) => splitCsvLine(l, d).length);
    if (counts[0] > 1 && counts.every((c) => c === counts[0])) {
      delim = d;
      break;
    }
  }
  const headers = splitCsvLine(lines[0], delim).map((h, i) => h.trim() || `col${i + 1}`);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delim);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { ok: true, value: rows };
}

// ---------------------------------------------------------------------------
// Stringifiers
// ---------------------------------------------------------------------------

export const toJsonPretty = (value: unknown, indent = 2): string => JSON.stringify(value, null, indent);
export const toJsonMin = (value: unknown): string => JSON.stringify(value);

export function toYaml(value: unknown): string {
  return stringifyYaml(value, { indent: 2 });
}

function tomlScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(tomlScalar).join(", ")}]`;
  return '""';
}

export function toToml(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("TOML needs a top-level object — wrap your data in { } first.");
  }
  const lines: string[] = [];
  const emit = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, v] of Object.entries(obj)) {
      const k = /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        lines.push(`[${path}]`);
        emit(v as Record<string, unknown>, path);
      } else if (
        Array.isArray(v) &&
        v.length > 0 &&
        v.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))
      ) {
        for (const item of v) {
          lines.push(`[[${path}]]`);
          emit(item as Record<string, unknown>, path);
        }
      } else {
        lines.push(`${k} = ${tomlScalar(v)}`);
      }
    }
  };
  emit(value as Record<string, unknown>, "");
  return lines.join("\n") + "\n";
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function valueToXml(value: unknown, tag: string, indent: string): string {
  if (value === null || value === undefined) return `${indent}<${tag}/>`;
  if (Array.isArray(value)) return value.map((v) => valueToXml(v, tag, indent)).join("\n");
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const attrs = Object.entries(rec)
      .filter(([k]) => k.startsWith("@"))
      .map(([k, v]) => ` ${k.slice(1)}="${xmlEscape(String(v))}"`)
      .join("");
    const kids = Object.entries(rec).filter(([k]) => !k.startsWith("@") && k !== "#text");
    const text = rec["#text"];
    const inner = kids.map(([k, v]) => valueToXml(v, k, indent + "  ")).join("\n");
    const parts = [text !== undefined && text !== null ? xmlEscape(String(text)) : "", inner].filter(Boolean).join("\n");
    if (!parts) return `${indent}<${tag}${attrs}/>`;
    return `${indent}<${tag}${attrs}>\n${parts}\n${indent}</${tag}>`;
  }
  return `${indent}<${tag}>${xmlEscape(String(value))}</${tag}>`;
}

export function toXml(value: unknown, rootName = "root"): string {
  let v = value;
  if (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v as Record<string, unknown>).length === 1 &&
    Object.keys(v as Record<string, unknown>)[0] === rootName
  ) {
    v = (v as Record<string, unknown>)[rootName];
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml(v, rootName, "")}`;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown): string {
  const arr = Array.isArray(rows) ? rows : [rows];
  const headers: string[] = [];
  for (const r of arr) {
    if (r !== null && typeof r === "object" && !Array.isArray(r)) {
      for (const k of Object.keys(r as Record<string, unknown>)) {
        if (!headers.includes(k)) headers.push(k);
      }
    }
  }
  if (headers.length === 0) return arr.map(csvEscape).join("\n");
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of arr) {
    if (r !== null && typeof r === "object" && !Array.isArray(r)) {
      lines.push(headers.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(","));
    } else {
      lines.push(csvEscape(r));
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// convert()
// ---------------------------------------------------------------------------

const PARSERS: Record<Exclude<Format, "sql">, (text: string) => ParseResult> = {
  json: parseJsonFriendly,
  yaml: parseYaml,
  toml: parseToml,
  xml: parseXml,
  csv: parseCsv,
};

export function convert(text: string, from: Format | "auto", to: Format): ConvertResult {
  let src: Detected;
  if (from === "auto") {
    src = detectFormat(text);
    if (src === "unknown") {
      return { ok: false, error: "Could not detect the input format — pick one manually." };
    }
  } else {
    src = from;
  }
  if (src === "sql") {
    return { ok: false, error: "SQL is output-only: use the SQL tab to format queries." };
  }
  if (to === "sql") {
    return { ok: false, error: "Conversion to SQL is not supported — use the SQL tab to format queries." };
  }
  const parsed = PARSERS[src as Exclude<Format, "sql">](text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    switch (to) {
      case "json":
        return { ok: true, output: toJsonPretty(parsed.value) };
      case "yaml":
        return { ok: true, output: toYaml(parsed.value) };
      case "toml":
        return { ok: true, output: toToml(parsed.value) };
      case "xml":
        return { ok: true, output: toXml(parsed.value) };
      case "csv":
        return { ok: true, output: toCsv(parsed.value) };
      default:
        return { ok: false, error: `Unsupported target: ${to}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Conversion failed" };
  }
}

/** Parse with the given (or auto-detected) format — used by Pretty/Minify/Sort/Validate. */
export function parseAny(text: string, from: Format | "auto"): ParseResult & { format?: Detected } {
  const src: Detected = from === "auto" ? detectFormat(text) : from;
  if (src === "unknown") return { ok: false, error: "Could not detect the input format — pick one manually." };
  if (src === "sql") return { ok: false, error: "SQL can't be parsed into data — use the SQL tab to format it.", format: src };
  const parsed = PARSERS[src as Exclude<Format, "sql">](text);
  return { ...parsed, format: src };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function escapeJsonString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

export function b64decode(b64: string): string {
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function urlEncode(text: string): string {
  return encodeURIComponent(text);
}

export function urlDecode(text: string): string {
  return decodeURIComponent(text);
}

// ---------------------------------------------------------------------------
// SQL formatter
// ---------------------------------------------------------------------------

const SQL_KEYWORDS = [
  "INSERT INTO",
  "DELETE FROM",
  "CREATE TABLE",
  "FULL OUTER JOIN",
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  "GROUP BY",
  "ORDER BY",
  "UNION ALL",
  "NOT NULL",
  "PRIMARY KEY",
  "FOREIGN KEY",
  "SELECT",
  "FROM",
  "WHERE",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "JOIN",
  "VALUES",
  "UPDATE",
  "DELETE",
  "UNION",
  "DISTINCT",
  "SET",
  "ON",
  "AND",
  "OR",
  "AS",
  "ASC",
  "DESC",
  "INTO",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "BETWEEN",
  "LIKE",
  "EXISTS",
  "NULL",
  "DEFAULT",
  "REFERENCES",
  "IN",
  "IS",
];

// Placeholder characters that can never collide with real SQL text.
const PH = "\u0001";

export function formatSql(text: string): string {
  if (!text.trim()) return "";
  // Protect string literals so keywords inside them are untouched.
  const literals: string[] = [];
  let t = text.replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `${PH}${literals.length - 1}${PH}`;
  });

  for (const kw of SQL_KEYWORDS) {
    const pattern = kw.replace(/ /g, "\\s+");
    t = t.replace(new RegExp(`\\b${pattern}\\b`, "gi"), kw);
  }

  // Newline before major clauses.
  t = t.replace(
    /\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION(?: ALL)?|VALUES|SET|(?:INNER|LEFT(?: OUTER)?|RIGHT(?: OUTER)?|FULL(?: OUTER)?|CROSS)?\s*JOIN|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\b/gi,
    "\n$1"
  );
  // AND / OR / ON conditions onto their own indented lines.
  t = t.replace(/\s+(AND|OR)\b/gi, "\n  $1");
  t = t.replace(/\s+(ON)\b/gi, "\n  $1");

  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out = lines.map((l) => (/^(AND|OR|ON)\b/.test(l) ? `  ${l}` : l)).join("\n");

  return out.replace(new RegExp(`${PH}(\\d+)${PH}`, "g"), (_, i) => literals[Number(i)]);
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const SAMPLES: Record<Format, string> = {
  json: `{
  "app": "format-lab",
  "version": 3,
  "features": ["convert", "format", "validate"],
  "limits": { "maxFileMB": 25, "offline": true },
  "maintainers": [
    { "name": "Ava", "role": "dev" },
    { "name": "Ravi", "role": "docs" }
  ]
}`,
  yaml: `app: format-lab
version: 3
features:
  - convert
  - format
  - validate
limits:
  maxFileMB: 25
  offline: true
maintainers:
  - name: Ava
    role: dev
  - name: Ravi
    role: docs
`,
  toml: `[app]
name = "format-lab"
version = 3

[limits]
maxFileMB = 25
offline = true

[[maintainers]]
name = "Ava"
role = "dev"

[[maintainers]]
name = "Ravi"
role = "docs"
`,
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<app name="format-lab" version="3">
  <features>
    <feature>convert</feature>
    <feature>format</feature>
    <feature>validate</feature>
  </features>
  <limits maxFileMB="25" offline="true"/>
  <maintainers>
    <maintainer><name>Ava</name><role>dev</role></maintainer>
    <maintainer><name>Ravi</name><role>docs</role></maintainer>
  </maintainers>
</app>`,
  csv: `name,role,commits
Ava,dev,142
Ravi,docs,87
"Maya, Jr.",design,64`,
  sql: `select u.name, u.email, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = true and u.created_at > '2026-01-01' group by u.name, u.email having count(o.id) > 2 order by orders desc limit 50;`,
};
