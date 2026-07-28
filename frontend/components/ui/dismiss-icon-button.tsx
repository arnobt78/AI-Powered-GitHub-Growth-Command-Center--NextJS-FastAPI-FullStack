/**
 * Ghost dismiss (X) control shared by recommendations / opportunities inboxes.
 */

"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DismissIconButton({
  onClick,
  disabled,
  label = "Dismiss",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <X className="h-4 w-4 text-red-500" aria-hidden="true" />
    </Button>
  );
}
