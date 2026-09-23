"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { restartFlowTour } from "@/components/shell/product-tour";

/**
 * A permanent way back into the tour.
 *
 * Restarting replays the CURRENT version from the beginning and writes
 * against that version's own record, so it never disturbs the fact that this
 * customer completed an earlier one.
 *
 * `ascendGrantActive` decides WHICH tour: the Intelligence-and-Operations
 * continuation, or the standalone Flow orientation that never mentions
 * Ascend. It is read from workspace state, never used for authorization.
 */
export function ProductTourSection({ ascendGrantActive }: { ascendGrantActive: boolean }) {
  const { user } = useAuth();
  const [starting, setStarting] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-4 w-4" /> Product tour
        </CardTitle>
        <CardDescription>
          A short walkthrough of how you capture, manage, convert, automate and measure.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          disabled={!user?.uid || starting}
          onClick={() => {
            if (!user?.uid) return;
            setStarting(true);
            // A tour failure must never surface as a stuck button.
            void restartFlowTour(user.uid, ascendGrantActive)
              .catch(() => {})
              .finally(() => setStarting(false));
          }}
        >
          {starting ? "Starting…" : "Take product tour"}
        </Button>
      </CardContent>
    </Card>
  );
}
