import { Card, CardContent } from "@/components/ui/card";

export default function EstimateDetailLoading() {
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardContent className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Loading estimate…</p>
          <div className="h-8 w-1/3 max-w-xs rounded bg-muted animate-pulse" />
          <div className="h-64 w-full rounded bg-muted/60 animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}
