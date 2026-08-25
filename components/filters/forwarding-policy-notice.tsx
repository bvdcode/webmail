"use client";

import { AlertTriangle, Info, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FilterAction } from "@/lib/jmap/sieve-types";
import {
  countForwardActions,
  exceedsRedirectLimit,
  retainsLocalCopy,
} from "@/lib/sieve/forwarding-policy";

interface ForwardingPolicyNoticeProps {
  actions: FilterAction[];
  maxNumberRedirects?: number;
  onAddKeep: () => void;
}

export function ForwardingPolicyNotice({
  actions,
  maxNumberRedirects,
  onAddKeep,
}: ForwardingPolicyNoticeProps) {
  const t = useTranslations("settings.filters");
  const forwardCount = countForwardActions(actions);

  if (forwardCount === 0) {
    return null;
  }

  const redirectLimitExceeded = exceedsRedirectLimit(actions, maxNumberRedirects);
  const keepsLocalCopy = retainsLocalCopy(actions);

  return (
    <div className="mt-3 space-y-2">
      {maxNumberRedirects !== undefined && redirectLimitExceeded && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {t("forward_limit_exceeded", {
              count: forwardCount,
              limit: maxNumberRedirects,
            })}
          </p>
        </div>
      )}

      {maxNumberRedirects !== undefined && !redirectLimitExceeded && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("forward_limit", { limit: maxNumberRedirects })}</p>
        </div>
      )}

      {!keepsLocalCopy && (
        <div
          role="note"
          className="flex flex-col items-start gap-3 rounded-md border border-border bg-muted/50 p-3 sm:flex-row sm:justify-between"
        >
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t("forward_removes_local_copy")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onAddKeep}>
            <Plus className="me-1 h-3.5 w-3.5" />
            {t("action_types.keep")}
          </Button>
        </div>
      )}
    </div>
  );
}
