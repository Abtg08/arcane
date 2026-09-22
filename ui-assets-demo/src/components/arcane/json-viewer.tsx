import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function tokenize(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function highlight(line: string) {
  const match = line.match(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)?(.*)$/);
  if (!match) {
    return <span className="text-muted-foreground">{line}</span>;
  }
  const [, indent, quoted, colon, rest] = match;
  if (!colon) {
    return (
      <>
        <span>{indent}</span>
        <span className="text-[var(--json-string)]">{quoted}</span>
        <span className="text-muted-foreground">{rest}</span>
      </>
    );
  }
  const valueClass = /^"/.test(rest ?? "")
    ? "text-[var(--json-string)]"
    : /^(true|false|null)/.test(rest ?? "")
      ? "text-[var(--json-keyword)]"
      : /^-?\d/.test(rest ?? "")
        ? "text-[var(--json-number)]"
        : "text-muted-foreground";
  return (
    <>
      <span>{indent}</span>
      <span className="text-[var(--json-key)]">{quoted}</span>
      <span className="text-muted-foreground">{colon}</span>
      <span className={valueClass}>{rest}</span>
    </>
  );
}

export function JsonViewer({
  title,
  value,
  className,
}: {
  title: string;
  value: unknown;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = tokenize(value);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed">
        <code>
          {text.split("\n").map((line, i) => (
            <div key={i} className="whitespace-pre">
              {highlight(line)}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
