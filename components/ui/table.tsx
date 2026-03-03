import * as React from "react";
import { cn } from "@/lib/utils";

const TableOptionsContext = React.createContext<{ compact: boolean; stickyHeader: boolean }>({
  compact: false,
  stickyHeader: true
});

export function Table({
  className,
  compact = false,
  stickyHeader = true,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & { compact?: boolean; stickyHeader?: boolean }) {
  return (
    <TableOptionsContext.Provider value={{ compact, stickyHeader }}>
      <div className="relative w-full overflow-auto rounded-md border border-border">
        <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
      </div>
    </TableOptionsContext.Provider>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  const { stickyHeader } = React.useContext(TableOptionsContext);
  return (
    <thead
      className={cn("[&_tr]:border-b", stickyHeader && "sticky top-0 z-10 bg-background/95 backdrop-blur", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors hover:bg-muted/40", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const { compact } = React.useContext(TableOptionsContext);
  return <th className={cn(compact ? "h-10 px-3" : "h-11 px-4", "text-left align-middle font-medium text-muted-foreground", className)} {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const { compact } = React.useContext(TableOptionsContext);
  return <td className={cn(compact ? "p-3" : "p-4", "align-middle", className)} {...props} />;
}
