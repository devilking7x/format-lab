import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowRight,
  Braces,
  Check,
  Copy,
  Download,
  FileUp,
  Info,
  Keyboard,
  Moon,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FORMAT_LABELS,
  FORMATS,
  SAMPLES,
  b64decode,
  b64encode,
  convert,
  detectFormat,
  formatSql,
  parseAny,
  sortKeysDeep,
  toJsonMin,
  toJsonPretty,
  urlDecode,
  urlEncode,
  type Detected,
  type Format,
} from "@/lib/convert";

const EXT: Record<Format, string> = {
  json: "json",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  csv: "csv",
  sql: "sql",
};

function LineNumbers({ text }: { text: string }) {
  const lines = Math.max(1, text.split("\n").length);
  return (
    <div className="select-none border-r border-white/[0.06] px-3 py-4 text-right font-mono text-[11px] leading-[1.72rem] text-slate-600">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index}>{String(index + 1).padStart(2, "0")}</div>
      ))}
    </div>
  );
}

function ToolSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className={`h-9 border-white/10 bg-white/[0.04] text-xs text-slate-200 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PaneShell({
  title,
  dot,
  badge,
  actions,
  children,
  footer,
}: {
  title: string;
  dot: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[480px] min-w-0 flex-col">
      <div className="flex h-12 items-center justify-between border-b border-white/[0.07] px-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="text-xs font-semibold text-slate-300">{title}</span>
          {badge}
        </div>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      <div className="flex flex-1 overflow-auto">{children}</div>
      {footer && <div className="border-t border-white/[0.07] px-4 py-3">{footer}</div>}
    </div>
  );
}

function statsOf(text: string) {
  return { chars: text.length, lines: text ? text.split("\n").length : 0 };
}

export default function Home() {
  // ---- Convert tab ----
  const [input, setInput] = useState(SAMPLES.json);
  const [output, setOutput] = useState("");
  const [fromFmt, setFromFmt] = useState<Format | "auto">("auto");
  const [toFmt, setToFmt] = useState<Format>("yaml");
  const [detected, setDetected] = useState<Detected>("unknown");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validMsg, setValidMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Encode tab ----
  const [encInput, setEncInput] = useState("Hello, Format Lab! こんにちは");
  const [encOutput, setEncOutput] = useState("");
  const [encMode, setEncMode] = useState<"base64" | "url">("base64");

  // ---- SQL tab ----
  const [sqlInput, setSqlInput] = useState(SAMPLES.sql);
  const [sqlOutput, setSqlOutput] = useState("");

  const inStats = useMemo(() => statsOf(input), [input]);
  const outStats = useMemo(() => statsOf(output), [output]);

  const effectiveDetected: Detected = useMemo(
    () => (fromFmt === "auto" ? detectFormat(input) : fromFmt),
    [fromFmt, input]
  );

  const clearConvertMessages = () => {
    setErrorMsg(null);
    setValidMsg(null);
  };

  const doConvert = () => {
    clearConvertMessages();
    if (!input.trim()) {
      setOutput("");
      toast.error("Paste something first");
      return;
    }
    const res = convert(input, fromFmt, toFmt);
    setDetected(fromFmt === "auto" ? detectFormat(input) : fromFmt);
    if (res.ok && res.output !== undefined) {
      setOutput(res.output);
      toast.success(`Converted to ${FORMAT_LABELS[toFmt]}`, { description: "Everything stayed in your browser." });
    } else {
      setOutput("");
      setErrorMsg(res.error ?? "Conversion failed");
      toast.error("Conversion failed", { description: (res.error ?? "").split("\n")[0].slice(0, 120) });
    }
  };

  const runJsonAction = (kind: "pretty" | "minify" | "sort" | "validate") => {
    clearConvertMessages();
    if (!input.trim()) {
      toast.error("Paste something first");
      return;
    }
    const parsed = parseAny(input, fromFmt);
    if (!parsed.ok) {
      setErrorMsg(parsed.error ?? "Invalid input");
      if (kind === "validate") setOutput("");
      toast.error("Invalid input", { description: (parsed.error ?? "").split("\n")[0].slice(0, 120) });
      return;
    }
    const label = parsed.format ? FORMAT_LABELS[parsed.format as Format] : "input";
    if (kind === "validate") {
      setValidMsg(`Valid ${label} ✓`);
      toast.success(`Valid ${label}`, { description: "Parsed locally, no uploads." });
      return;
    }
    const value = kind === "sort" ? sortKeysDeep(parsed.value) : parsed.value;
    setOutput(kind === "minify" ? toJsonMin(value) : toJsonPretty(value));
    setDetected(parsed.format ?? "unknown");
    toast.success(kind === "pretty" ? "Prettified" : kind === "minify" ? "Minified" : "Keys sorted", {
      description: "Rendered as JSON.",
    });
  };

  const copyText = async (text: string, label: string) => {
    if (!text) {
      toast.error(`Nothing to copy yet`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked by the browser");
    }
  };

  const downloadOutput = () => {
    if (!output) {
      toast.error("Convert something before downloading");
      return;
    }
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `converted.${EXT[toFmt]}`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("File downloaded");
  };

  const importFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result ?? ""));
      setFileName(file.name);
      setOutput("");
      clearConvertMessages();
      const ext = file.name.split(".").pop()?.toLowerCase();
      const byExt: Record<string, Format> = { json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", csv: "csv", sql: "sql" };
      if (ext && byExt[ext]) {
        setFromFmt(byExt[ext]);
        toast.success("File loaded", { description: `Detected ${FORMAT_LABELS[byExt[ext]]} by extension.` });
      } else {
        setFromFmt("auto");
        toast.success("File loaded", { description: "The file stayed in your browser." });
      }
    };
    reader.onerror = () => toast.error("Could not read that file");
    reader.readAsText(file);
  };

  // ---- Encode tab actions ----
  const doEncode = () => {
    try {
      setEncOutput(encMode === "base64" ? b64encode(encInput) : urlEncode(encInput));
      toast.success(encMode === "base64" ? "Base64 encoded" : "URL encoded");
    } catch (e) {
      toast.error("Encoding failed", { description: e instanceof Error ? e.message : undefined });
    }
  };
  const doDecode = () => {
    try {
      setEncInput(encMode === "base64" ? b64decode(encOutput || encInput) : urlDecode(encOutput || encInput));
      toast.success(encMode === "base64" ? "Base64 decoded" : "URL decoded");
    } catch {
      toast.error("Decoding failed", { description: "The input is not valid " + (encMode === "base64" ? "Base64" : "URL-encoded text") + "." });
    }
  };

  // ---- SQL tab actions ----
  const doFormatSql = () => {
    if (!sqlInput.trim()) {
      toast.error("Paste a SQL query first");
      return;
    }
    setSqlOutput(formatSql(sqlInput));
    toast.success("SQL formatted", { description: "Keywords uppercased, clauses on new lines." });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        const active = document.activeElement;
        if (active && active.tagName === "TEXTAREA") {
          event.preventDefault();
          doConvert();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, fromFmt, toFmt]);

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100 selection:bg-mint/30 selection:text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080b10]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-mint text-[#07100d] shadow-[0_0_24px_rgba(142,240,193,0.22)]">
              <Braces size={19} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[15px] font-bold tracking-tight text-white">Format Lab</span>
                <span className="rounded-full border border-mint/20 bg-mint/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-mint">Open source</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">100% local — convert, format &amp; validate without uploads</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-5">
            <div className="hidden items-center gap-2 text-[11px] text-slate-500 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_9px_#8ef0c1]" />
              No uploads · privacy first
            </div>
            <a className="hidden items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white sm:flex" href="#how-it-works">
              <Info size={15} /> How it works
            </a>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-500 transition hover:border-white/20 hover:text-white" type="button" title="Dark mode">
              <Moon size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-7 lg:px-10 lg:py-10">
        <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-mint"><Sparkles size={14} /> Developer utility / 01</div>
            <h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">Every format, one tab.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Convert between JSON, YAML, TOML, XML and CSV, encode text, and format SQL — all inside your browser.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><Keyboard size={14} /><span><kbd>⌘</kbd><kbd>↵</kbd> convert</span></div>
        </div>

        <Tabs defaultValue="convert" className="w-full">
          <TabsList className="mb-6 border border-white/[0.08] bg-white/[0.03]">
            <TabsTrigger value="convert" className="px-5">Convert</TabsTrigger>
            <TabsTrigger value="encode" className="px-5">Encode</TabsTrigger>
            <TabsTrigger value="sql" className="px-5">SQL</TabsTrigger>
          </TabsList>

          {/* ================= CONVERT ================= */}
          <TabsContent value="convert">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <ToolSelect
                ariaLabel="Input format"
                value={fromFmt}
                onChange={(v) => { setFromFmt(v as Format | "auto"); clearConvertMessages(); }}
                options={[{ value: "auto", label: "Auto-detect" }, ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))]}
                className="w-[150px]"
              />
              <ArrowRight size={16} className="text-slate-600" />
              <ToolSelect
                ariaLabel="Output format"
                value={toFmt}
                onChange={(v) => setToFmt(v as Format)}
                options={FORMATS.filter((f) => f !== "sql").map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
                className="w-[130px]"
              />
              <button className="btn-primary !h-9" onClick={doConvert} type="button"><Play size={15} fill="currentColor" /> Convert</button>
              <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
              <button className="btn-ghost" onClick={() => runJsonAction("pretty")} type="button">Pretty</button>
              <button className="btn-ghost" onClick={() => runJsonAction("minify")} type="button">Minify</button>
              <button className="btn-ghost" onClick={() => runJsonAction("validate")} type="button"><ShieldCheck size={14} /> Validate</button>
              <button className="btn-ghost" onClick={() => runJsonAction("sort")} type="button">Sort keys</button>
            </div>

            {errorMsg && (
              <Card className="mb-4 border-rose-400/25 bg-rose-400/[0.05]">
                <CardContent className="flex items-start gap-2 px-4 py-3 text-[12px] leading-5 text-rose-200">
                  <X size={15} className="mt-0.5 shrink-0 text-rose-300" />
                  <span className="whitespace-pre-wrap font-mono">{errorMsg}</span>
                </CardContent>
              </Card>
            )}
            {validMsg && (
              <Card className="mb-4 border-mint/25 bg-mint/[0.05]">
                <CardContent className="flex items-center gap-2 px-4 py-3 text-[12px] text-mint">
                  <Check size={15} className="shrink-0" /> {validMsg}
                </CardContent>
              </Card>
            )}

            <div className="workspace-grid grid min-h-[540px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c1118] shadow-[0_22px_70px_rgba(0,0,0,0.28)] xl:grid-cols-2">
              <PaneShell
                title="Input"
                dot="bg-amber-300"
                badge={
                  input.trim() && effectiveDetected !== "unknown" ? (
                    <Badge variant="secondary" className="font-mono text-[10px]">{FORMAT_LABELS[effectiveDetected as Format]}</Badge>
                  ) : undefined
                }
                actions={
                  <>
                    <ToolSelect
                      ariaLabel="Load sample"
                      value=""
                      onChange={(v) => { if (v) { setInput(SAMPLES[v as Format]); setFileName(""); clearConvertMessages(); setOutput(""); } }}
                      options={[{ value: "", label: "Sample…" }, ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))]}
                      className="w-[110px] !h-8"
                    />
                    <button className="btn-ghost !h-8" onClick={() => fileInputRef.current?.click()} type="button"><Upload size={14} /> <span className="hidden sm:inline">Open file</span></button>
                    <input ref={fileInputRef} accept=".json,.yaml,.yml,.toml,.xml,.csv,.sql,.txt" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} type="file" />
                    <button className="btn-ghost !h-8" onClick={() => { setInput(""); setOutput(""); setFileName(""); clearConvertMessages(); }} type="button"><RotateCcw size={14} /></button>
                  </>
                }
                footer={<span className="text-[11px] text-slate-600">{fileName || `${inStats.chars} chars · ${inStats.lines} lines`}</span>}
              >
                <LineNumbers text={input} />
                <textarea
                  aria-label="Convert input"
                  className="min-h-[420px] flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.72rem] text-slate-300 outline-none placeholder:text-slate-700"
                  onChange={(e) => { setInput(e.target.value); clearConvertMessages(); }}
                  placeholder="Paste JSON, YAML, TOML, XML or CSV…"
                  spellCheck={false}
                  value={input}
                />
              </PaneShell>

              <PaneShell
                title="Output"
                dot={output ? "bg-mint" : "bg-slate-600"}
                badge={output ? <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">READY</span> : undefined}
                actions={
                  <>
                    <button aria-label="Copy output" className="icon-button" onClick={() => copyText(output, "Output")} title="Copy output" type="button"><Copy size={15} /></button>
                    <button aria-label="Download output" className="icon-button" onClick={downloadOutput} title="Download output" type="button"><Download size={15} /></button>
                  </>
                }
                footer={<span className="text-[11px] text-slate-600">{output ? `${outStats.chars} chars · ${outStats.lines} lines` : "Run Convert to see the result"}</span>}
              >
                <textarea
                  aria-label="Convert output"
                  readOnly
                  className="min-h-[420px] flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.72rem] text-mint/90 outline-none placeholder:text-slate-700"
                  placeholder="Your converted output will appear here…"
                  spellCheck={false}
                  value={output}
                />
              </PaneShell>
            </div>
          </TabsContent>

          {/* ================= ENCODE ================= */}
          <TabsContent value="encode">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <ToolSelect
                ariaLabel="Encoding mode"
                value={encMode}
                onChange={(v) => setEncMode(v as "base64" | "url")}
                options={[{ value: "base64", label: "Base64" }, { value: "url", label: "URL" }]}
                className="w-[130px]"
              />
              <button className="btn-primary !h-9" onClick={doEncode} type="button">Encode ↓</button>
              <button className="btn-ghost !h-9" onClick={doDecode} type="button">Decode ↑</button>
              <button className="btn-ghost !h-9" onClick={() => { setEncInput(encOutput); setEncOutput(encInput); }} type="button" title="Swap panes"><ArrowLeftRight size={14} /> Swap</button>
            </div>
            <div className="workspace-grid grid min-h-[420px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c1118] xl:grid-cols-2">
              <PaneShell title="Plain text" dot="bg-amber-300" footer={<span className="text-[11px] text-slate-600">{statsOf(encInput).chars} chars · Unicode-safe</span>}>
                <textarea
                  aria-label="Plain text"
                  className="min-h-[360px] flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.72rem] text-slate-300 outline-none placeholder:text-slate-700"
                  onChange={(e) => setEncInput(e.target.value)}
                  placeholder="Type or paste text…"
                  spellCheck={false}
                  value={encInput}
                />
              </PaneShell>
              <PaneShell
                title="Encoded"
                dot="bg-mint"
                actions={<button aria-label="Copy encoded" className="icon-button" onClick={() => copyText(encOutput, "Encoded text")} title="Copy encoded" type="button"><Copy size={15} /></button>}
                footer={<span className="text-[11px] text-slate-600">{statsOf(encOutput).chars} chars</span>}
              >
                <textarea
                  aria-label="Encoded text"
                  className="min-h-[360px] flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.72rem] text-mint/90 outline-none placeholder:text-slate-700"
                  onChange={(e) => setEncOutput(e.target.value)}
                  placeholder="Encoded output…"
                  spellCheck={false}
                  value={encOutput}
                />
              </PaneShell>
            </div>
          </TabsContent>

          {/* ================= SQL ================= */}
          <TabsContent value="sql">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button className="btn-primary !h-9" onClick={doFormatSql} type="button"><Play size={15} fill="currentColor" /> Format SQL</button>
              <button className="btn-ghost !h-9" onClick={() => { setSqlInput(SAMPLES.sql); setSqlOutput(""); }} type="button"><FileUp size={14} /> Sample</button>
              <button className="btn-ghost !h-9" onClick={() => { setSqlInput(""); setSqlOutput(""); }} type="button"><RotateCcw size={14} /> Clear</button>
            </div>
            <div className="workspace-grid grid min-h-[420px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c1118] xl:grid-cols-2">
              <PaneShell title="Query" dot="bg-amber-300" footer={<span className="text-[11px] text-slate-600">{statsOf(sqlInput).chars} chars</span>}>
                <textarea
                  aria-label="SQL input"
                  className="min-h-[360px] flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.72rem] text-slate-300 outline-none placeholder:text-slate-700"
                  onChange={(e) => setSqlInput(e.target.value)}
                  placeholder="Paste a SQL query…"
                  spellCheck={false}
                  value={sqlInput}
                />
              </PaneShell>
              <PaneShell
                title="Formatted"
                dot={sqlOutput ? "bg-mint" : "bg-slate-600"}
                actions={<button aria-label="Copy SQL" className="icon-button" onClick={() => copyText(sqlOutput, "Formatted SQL")} title="Copy SQL" type="button"><Copy size={15} /></button>}
                footer={<span className="text-[11px] text-slate-600">{sqlOutput ? `${statsOf(sqlOutput).chars} chars` : "Keywords uppercased · clauses on new lines"}</span>}
              >
                <textarea
                  aria-label="SQL output"
                  readOnly
                  className="min-h-[360px] flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.72rem] text-mint/90 outline-none placeholder:text-slate-700"
                  placeholder="Formatted SQL will appear here…"
                  spellCheck={false}
                  value={sqlOutput}
                />
              </PaneShell>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-16 grid gap-4 border-t border-white/[0.07] pt-8 sm:grid-cols-3" id="how-it-works">
          <div className="feature-note"><div className="feature-icon"><ArrowLeftRight size={16} /></div><div><h2>Convert anything</h2><p>JSON ↔ YAML ↔ TOML ↔ XML ↔ CSV with auto-detection.</p></div></div>
          <div className="feature-note"><div className="feature-icon"><ShieldCheck size={16} /></div><div><h2>Stay private</h2><p>All parsing happens inside your browser tab. Nothing is uploaded.</p></div></div>
          <div className="feature-note"><div className="feature-icon"><Sparkles size={16} /></div><div><h2>Extra tools</h2><p>Base64/URL encoding and SQL formatting included.</p></div></div>
        </div>
      </main>
      <footer className="border-t border-white/[0.07] px-5 py-5 text-center text-[11px] text-slate-600">Format Lab runs 100% locally — your data never leaves this tab.</footer>
    </div>
  );
}
