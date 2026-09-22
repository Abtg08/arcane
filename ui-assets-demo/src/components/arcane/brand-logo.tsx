import { cn } from "@/lib/utils";

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} aria-label="Arcane">
      <svg
        viewBox="0 0 36 36"
        role="img"
        aria-hidden="true"
        className="size-8 shrink-0"
      >
        <path d="M18 2 5 31h7.1L18 18.1l3.1 6.7 3.6-7.8L18 2Z" fill="var(--ember)" />
        <path d="m24.8 10.8-9.1 20.1h7.1l5.6-12.4 2.6 5.7 3.4-7.5-4.2-9.2-5.4 3.3Z" fill="var(--flame)" />
        <path d="m15.7 30.9 3.5-7.7 3.6 7.7h-7.1Z" fill="var(--amber)" />
      </svg>
      {!compact && <span className="text-[17px] font-bold leading-none text-foreground">Arcane</span>}
    </div>
  );
}