import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Terminal } from "lucide-react";
import { setStoredApiKey } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const BASE_URL = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";

async function validateKey(key: string): Promise<boolean> {
  // In mock mode (no base URL) any non-empty key is accepted
  if (!BASE_URL.trim()) return true;
  try {
    const res = await fetch(`${BASE_URL}/toolkits?limit=1`, {
      headers: { "X-Api-Key": key },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function LoginPage() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("API key is required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const valid = await validateKey(trimmed);
      if (!valid) {
        setError("Invalid API key — check the key and try again.");
        return;
      }
      setStoredApiKey(trimmed);
      await navigate({ to: "/dashboard" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card">
            <Terminal className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Arcane</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your API key to access the dashboard
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="api-key" className="text-sm font-medium">
              API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="arc_live_..."
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "h-9 w-full rounded-md border bg-background px-3 pr-10 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  error ? "border-destructive" : "border-input",
                )}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                tabIndex={-1}
                aria-label={showKey ? "Hide key" : "Show key"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Generate an API key via the Arcane CLI:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            arcane keys create
          </code>
        </p>
      </div>
    </div>
  );
}
