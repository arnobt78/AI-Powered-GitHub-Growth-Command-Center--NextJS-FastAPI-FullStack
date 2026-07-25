"use client";

import { useState } from "react";
import { Mail, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { useMe, useUpdateMe } from "@/hooks/use-me";

export function NotificationSettingsCard() {
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const [value, setValue] = useState(me?.notification_email ?? "");

  // Re-sync local input whenever the server value changes (e.g. the
  // `user_updated` SSE event refetching this from another tab) — without
  // this, useState's initializer only runs once, so a newer server value
  // would be silently overwritten by the stale local value on the next Save.
  // Adjusting state during render (React's documented pattern for this,
  // guarded by comparing against the last-seen server value) rather than in
  // a useEffect avoids an extra post-commit render pass.
  const [lastSyncedEmail, setLastSyncedEmail] = useState(me?.notification_email);
  if (me?.notification_email !== lastSyncedEmail) {
    setLastSyncedEmail(me?.notification_email);
    setValue(me?.notification_email ?? "");
  }

  const effectiveEmail = me?.notification_email || me?.email || "No email on file";

  const handleSave = () => {
    const trimmed = value.trim();
    updateMe.mutate(
      { notification_email: trimmed || null },
      { onError: () => toast.error("Could not update notification email", { description: "Please try again." }) },
    );
  };

  return (
    <div className="space-y-3">
      <SectionHeading icon={Mail} title="Notifications" iconColor="text-amber-500" />
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">
            Alert emails currently go to: <span className="font-medium">{effectiveEmail}</span>
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="fallback-email@example.com"
              aria-label="Notification fallback email"
            />
            <Button onClick={handleSave} disabled={updateMe.isPending}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
