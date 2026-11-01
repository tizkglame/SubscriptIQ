import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

export function DemoBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    import("../demo/client")
      .then(({ initializeDemo }) => initializeDemo())
      .then(
        () => {
          if (mounted) setReady(true);
        },
        (reason) => {
          if (mounted)
            setError(reason instanceof Error ? reason.message : "Demo initialization failed");
        },
      );
    return () => {
      mounted = false;
    };
  }, []);
  if (ready) return children;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center" role="status" aria-live="polite">
        {!error && <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />}
        <h1 className="text-xl font-semibold">
          {error ? "Couldn't open the demo" : "Preparing your demo workspace…"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error ||
            "Loading sample customers, subscriptions and invoices. Your changes stay in this browser. The first visit may take a few seconds."}
        </p>
        {error && (
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function DemoNotice() {
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (
      !window.confirm(
        "Reset this browser's demo workspace? This removes your demo edits and restores the sample data.",
      )
    )
      return;
    setBusy(true);
    try {
      await (await import("../demo/client")).resetDemo();
      window.location.reload();
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not reset the demo");
    }
  }
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
      <div>
        <p className="font-semibold">Interactive demo</p>
        <p className="mt-1 text-muted-foreground">
          Sample data stays in this browser. Sign out to try another role.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
        {busy ? "Resetting…" : "Reset demo"}
      </Button>
    </div>
  );
}
