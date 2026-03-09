"use client";

interface TopBarProps {
  title?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, actions }: TopBarProps) {
  return (
    <header className="h-12 border-b border-border bg-background flex items-center justify-between px-6 shrink-0 no-print">
      {title && (
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      )}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
