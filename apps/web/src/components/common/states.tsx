import * as React from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <Card className={cn("flex flex-col items-center gap-3 p-8 text-center text-muted-foreground", className)}>
      <Icon className="size-8 text-muted-foreground/60" />
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {children && <p className="max-w-sm text-sm">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

type LoadingSkeletonProps =
  | { variant: "table"; rows?: number }
  | { variant: "card-list"; count?: number }
  | { variant: "form"; fields?: number };

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  if (props.variant === "table") {
    const rows = props.rows ?? 5;
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} data-skeleton-row className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (props.variant === "card-list") {
    const count = props.count ?? 3;
    return (
      <div className="grid gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} data-skeleton-card className="h-20 w-full rounded-md" />
        ))}
      </div>
    );
  }
  const fields = props.fields ?? 4;
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} data-skeleton-field className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

type ErrorStateProps = {
  title: string;
  children?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ title, children, onRetry, className }: ErrorStateProps) {
  return (
    <Card className={cn("flex flex-col items-center gap-3 p-8 text-center", className)}>
      <AlertCircle className="size-8 text-destructive" />
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Retry
        </Button>
      )}
    </Card>
  );
}
