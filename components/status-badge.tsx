import { Badge } from "@/components/ui/badge";

type StatusCategory = "employer" | "testRequest" | "payment" | "certificate" | "random" | "result";

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function StatusBadge({ value, category }: { value: string; category?: StatusCategory }) {
  const normalized = value.toUpperCase();
  if (category === "payment") {
    if (normalized === "PAID") return <Badge variant="success">{formatLabel(value)}</Badge>;
    if (normalized === "PENDING") return <Badge variant="warning">{formatLabel(value)}</Badge>;
    return <Badge variant="destructive">{formatLabel(value)}</Badge>;
  }
  if (category === "certificate") {
    if (normalized === "ACTIVE") return <Badge variant="success">{formatLabel(value)}</Badge>;
    return <Badge variant="destructive">{formatLabel(value)}</Badge>;
  }
  if (category === "testRequest" || category === "random") {
    if (normalized.includes("COMPLETED")) return <Badge variant="success">{formatLabel(value)}</Badge>;
    if (normalized.includes("REQUESTED") || normalized.includes("SCHEDULED") || normalized.includes("PENDING")) {
      return <Badge variant="warning">{formatLabel(value)}</Badge>;
    }
    if (normalized.includes("CANCELLED") || normalized.includes("FAILED") || normalized.includes("REFUSAL")) {
      return <Badge variant="destructive">{formatLabel(value)}</Badge>;
    }
    return <Badge variant="secondary">{formatLabel(value)}</Badge>;
  }
  if (category === "result") {
    if (normalized === "NEGATIVE") return <Badge variant="success">{formatLabel(value)}</Badge>;
    if (normalized === "PENDING") return <Badge variant="warning">{formatLabel(value)}</Badge>;
    if (normalized === "POSITIVE" || normalized === "REFUSAL" || normalized === "CANCELLED") {
      return <Badge variant="destructive">{formatLabel(value)}</Badge>;
    }
  }
  if (category === "employer") {
    if (normalized === "ACTIVE") return <Badge variant="success">{formatLabel(value)}</Badge>;
    if (normalized === "PENDING_PAYMENT") return <Badge variant="warning">{formatLabel(value)}</Badge>;
    if (normalized === "INACTIVE") return <Badge variant="destructive">{formatLabel(value)}</Badge>;
  }

  if (normalized.includes("ACTIVE") || normalized.includes("PAID") || normalized.includes("COMPLETED") || normalized.includes("NEGATIVE")) {
    return <Badge variant="success">{formatLabel(value)}</Badge>;
  }
  if (normalized.includes("PENDING") || normalized.includes("SCHEDULED")) {
    return <Badge variant="warning">{formatLabel(value)}</Badge>;
  }
  if (normalized.includes("FAILED") || normalized.includes("VOID") || normalized.includes("INACTIVE") || normalized.includes("POSITIVE") || normalized.includes("REFUSAL")) {
    return <Badge variant="destructive">{formatLabel(value)}</Badge>;
  }
  return <Badge variant="secondary">{formatLabel(value)}</Badge>;
}
