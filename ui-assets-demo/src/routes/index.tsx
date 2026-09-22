import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Blocks, Braces, Check, CircleDot, Command, MoveUpRight, Play, ShieldCheck, Workflow } from "lucide-react";
import { BrandLogo } from "@/components/arcane/brand-logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arcane — The execution layer for AI agents" },
      { name: "description", content: "Connect AI agents to real tools, execute with control, and inspect every run from one precise platform." },
      { property: "og:title", content: "Arcane — The execution layer for AI agents" },
      { property: "og:description", content: "Connect AI agents to real tools, execute with control, and inspect every run from one precise platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const STEPS = [
  { number: "01", title: "Connect the tools", text: "Authorize each service once. Arcane keeps credentials scoped and out of agent context." },
  { number: "02", title: "Set the boundaries", text: "Define which actions can run, who can run them, and when approval is required." },
  { number: "03", title: "Ship with evidence", text: "Trace every input, output, decision, and side effect from one operational record." },
];

function LandingPage() {
  return (
    <main className="landing min-h-screen overflow-hidden bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-5 lg:px-8">
          <a href="#top" aria-label="Arcane home"><BrandLogo /></a>
          <nav className="hidden items-center gap-8 text-[13px] text-muted-foreground md:flex">
            <a href="#platform" className="transition-colors hover:text-foreground">Platform</a>
            <a href="#workflow" className="transition-colors hover:text-foreground">Workflow</a>
            <a href="#security" className="transition-colors hover:text-foreground">Security</a>
          </nav>
          <Button asChild size="sm" className="group rounded-full px-4">
            <Link to="/dashboard">Open Arcane <ArrowRight className="transition-transform group-hover:translate-x-0.5" /></Link>
          </Button>
        </div>
      </header>

      <section id="top" className="relative mx-auto grid min-h-[92vh] max-w-[1280px] items-center gap-14 px-5 pb-20 pt-28 lg:grid-cols-[1.12fr_0.88fr] lg:px-8">
        <div className="landing-grid" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl animate-fade-in">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-flame/25 bg-flame/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-amber">
            <CircleDot className="size-3 motion-pulse" /> The control plane for agent actions
          </div>
          <h1 className="landing-display max-w-3xl text-[56px] leading-[0.9] sm:text-7xl lg:text-[88px]">
            Let agents act.<br /><span className="italic text-flame">Keep control.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Arcane gives AI agents one governed path to your tools—with scoped access, policy checks, and a complete record of every action.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="group rounded-full px-6">
              <Link to="/dashboard"><Play className="fill-current" /> Enter the console <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link>
            </Button>
            <a href="#platform" className="group inline-flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">See the system <MoveUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a>
          </div>
          <div className="mt-14 flex flex-wrap gap-x-7 gap-y-3 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span><b className="mr-2 text-success">●</b>Policy engine online</span>
            <span>30s live telemetry</span>
            <span>Immutable traces</span>
          </div>
        </div>

        <div className="execution-panel relative z-10 overflow-hidden rounded-2xl border border-flame/20 bg-card/80 backdrop-blur-sm">
          <div className="flex h-12 items-center justify-between border-b border-border px-5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-2"><Command className="size-3.5 text-flame" />Live execution</span><span className="flex items-center gap-2 text-amber"><span className="size-1.5 rounded-full bg-flame motion-pulse" /> Running</span>
          </div>
          <div className="space-y-5 p-5 font-mono text-xs sm:p-6">
            <div className="execution-row"><span className="text-muted-foreground">agent</span><span>research-agent-07</span></div>
            <div className="execution-row"><span className="text-muted-foreground">tool</span><span className="text-flame">github.create_issue</span></div>
            <div className="execution-row"><span className="text-muted-foreground">workspace</span><span>acme-production</span></div>
            <div className="fire-spectrum h-1 overflow-hidden rounded-full"><span className="execution-line block h-full w-1/3 bg-amber" /></div>
            <div className="execution-row"><span className="text-muted-foreground">policy</span><span className="flex items-center gap-1.5 text-success"><Check className="size-3" /> approved</span></div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
              <div className="bg-background p-3"><span className="block text-[9px] uppercase text-muted-foreground">Latency</span><strong className="mt-1 block text-copper">482ms</strong></div>
              <div className="bg-background p-3"><span className="block text-[9px] uppercase text-muted-foreground">Events</span><strong className="mt-1 block text-flame">06</strong></div>
              <div className="bg-background p-3"><span className="block text-[9px] uppercase text-muted-foreground">Risk</span><strong className="mt-1 block text-amber">WRITE</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-y border-border bg-card/30 py-24 sm:py-32">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <p className="section-kicker">One execution plane</p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_0.7fr] lg:items-end">
            <h2 className="landing-display max-w-3xl text-4xl leading-[0.98] sm:text-6xl">Every action, governed.<br /><span className="italic text-copper">Every outcome, visible.</span></h2>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">Replace fragile one-off integrations with a single operational layer built for agent speed and human accountability.</p>
          </div>
          <div className="mt-14 grid border-l border-t border-border md:grid-cols-3">
            {[{ icon: Blocks, tone: "text-flame", title: "Unified toolkits", text: "One interface for GitHub, Slack, Gmail, databases, and the services your business runs on." }, { icon: Workflow, tone: "text-amber", title: "Reliable orchestration", text: "Connections, triggers, and executions share one consistent operational model." }, { icon: Braces, tone: "text-copper", title: "Full-fidelity traces", text: "See structured inputs, outputs, duration, status, and an immutable sequence of events." }].map((item) => (
              <article key={item.title} className="feature-cell border-b border-r border-border p-7">
                <item.icon className={`size-5 ${item.tone}`} />
                <h3 className="mt-12 text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="py-24 sm:py-32">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1fr]">
            <div><p className="section-kicker">From intent to action</p><h2 className="landing-display mt-5 max-w-lg text-4xl leading-none sm:text-6xl">Move fast.<br /><span className="italic text-amber">Stay accountable.</span></h2></div>
            <div className="border-t border-border">
              {STEPS.map((step) => <div key={step.number} className="group grid grid-cols-[48px_1fr] gap-4 border-b border-border py-7"><span className="font-mono text-xs text-primary">{step.number}</span><div><h3 className="text-xl font-medium transition-transform duration-300 group-hover:translate-x-1">{step.title}</h3><p className="mt-2 text-sm text-muted-foreground">{step.text}</p></div></div>)}
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="border-y border-border bg-card/30 py-24 sm:py-32">
        <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-5 lg:grid-cols-2 lg:px-8">
          <div className="max-w-xl"><ShieldCheck className="size-8 text-primary" /><p className="section-kicker mt-8">Control without friction</p><h2 className="landing-display mt-5 text-4xl leading-none sm:text-6xl">Powerful agents.<br /><span className="italic text-flame">Explicit boundaries.</span></h2><p className="mt-6 leading-7 text-muted-foreground">Risk-aware tools, scoped connections, and a complete execution trail keep every action understandable and accountable.</p></div>
          <div className="overflow-hidden rounded-2xl border border-border bg-background font-mono text-xs"><div className="flex items-center justify-between border-b border-border px-6 py-5 text-muted-foreground"><span>POLICY / PRE-FLIGHT</span><span className="text-success">PASSED</span></div><div className="px-6">{["Agent identity verified", "Connection scope matched", "Write risk accepted", "Audit record reserved"].map((x, index) => <div key={x} className="flex items-center justify-between border-b border-border py-4 last:border-0"><span className="flex items-center gap-3"><Check className="size-3.5 text-primary" />{x}</span><span className="text-muted-foreground">0{index + 1}</span></div>)}</div></div>
        </div>
      </section>

      <section className="py-24 text-center sm:py-32"><div className="mx-auto max-w-4xl px-5"><p className="section-kicker">Ready when your agents are</p><h2 className="landing-display mt-6 text-5xl leading-none sm:text-7xl">Give them reach.<br /><span className="italic text-amber">Keep the receipts.</span></h2><p className="mx-auto mt-6 max-w-xl leading-7 text-muted-foreground">Step into the operational console and see Arcane managing real agent activity.</p><Button asChild size="lg" className="mt-9 group rounded-full px-7"><Link to="/dashboard">Open the console <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link></Button></div></section>

      <footer className="border-t border-border"><div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-5 px-5 py-7 sm:flex-row sm:items-center lg:px-8"><BrandLogo className="w-[112px]" /><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">The execution layer for AI agents.</p></div></footer>
    </main>
  );
}
