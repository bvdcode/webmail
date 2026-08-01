"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { toast } from "@/stores/toast-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFilterStore } from "@/stores/filter-store";
import { backfillQuickFilter } from "@/lib/sieve/quick-filter-backfill";
import {
  buildQuickFilterDraftRule,
  buildQuickFilterRule,
  createQuickFilterDraft,
  isQuickFilterDraftComplete,
  type QuickFilterDraft,
  type QuickFilterField,
} from "@/lib/sieve/quick-filter";
import type { Email, Mailbox } from "@/lib/jmap/types";
import type { FilterRule } from "@/lib/jmap/sieve-types";
import { FilterRuleModal } from "./filter-rule-modal";
import { QuickFilterForm } from "./quick-filter-form";

interface QuickFilterModalProps {
  email: Email;
  mailboxes: Mailbox[];
  /** The folder on screen, offered as the target for applying the new rule to existing mail. Empty disables that step. */
  currentMailboxId: string;
  onClose: () => void;
}

type LoadState = "loading" | "ready" | "failed" | "opaque";
type Step = "edit" | "backfill";

export function QuickFilterModal({
  email,
  mailboxes,
  currentMailboxId,
  onClose,
}: QuickFilterModalProps) {
  const t = useTranslations("quick_filter");
  const tFilters = useTranslations("settings.filters");
  const tNotifications = useTranslations("notifications");
  const client = useAuthStore((state) => state.client);

  const [draft, setDraft] = useState<QuickFilterDraft>(() => createQuickFilterDraft(email));
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [step, setStep] = useState<Step>("edit");
  const [isBusy, setIsBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isBusyRef = useRef(false);

  const modalRef = useFocusTrap({ isActive: !showAdvanced, onEscape: onClose });

  // Saving re-serialises the whole script from the store, so the store has to
  // hold this account's current rules first. Login hydrates them, but that
  // fetch is fire-and-forget and Settings can leave the store pointed at a
  // shared account - re-selecting the personal account here covers both.
  useEffect(() => {
    if (!client) {
      setLoadState("failed");
      return;
    }
    let cancelled = false;
    void useFilterStore
      .getState()
      .selectAccount(client, client.getSieveAccountId())
      .then(() => {
        if (cancelled) return;
        const { error, isOpaque } = useFilterStore.getState();
        setLoadState(error ? "failed" : isOpaque ? "opaque" : "ready");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const fieldLabel = useCallback(
    (field: QuickFilterField) => tFilters(`condition_fields.${field}`),
    [tFilters]
  );

  const persist = useCallback(
    async (rule: FilterRule) => {
      // The full editor's Save button has no busy state of its own, so a second
      // click must not append the rule twice.
      if (!client || isBusyRef.current) return;
      isBusyRef.current = true;
      const previousRules = useFilterStore.getState().rules;
      useFilterStore.getState().addRule(rule);
      setIsBusy(true);
      try {
        await useFilterStore.getState().saveFilters(client);
        toast.success(tNotifications("filters_saved"));
        // Sieve only runs on delivery, so the rule looks inert until new mail
        // arrives. Offer to apply it to what is already here.
        if (currentMailboxId) {
          setShowAdvanced(false);
          setStep("backfill");
        } else {
          onClose();
        }
      } catch {
        useFilterStore.setState({ rules: previousRules });
        toast.error(tNotifications("filters_save_failed"));
      } finally {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    },
    [client, currentMailboxId, onClose, tNotifications]
  );

  const handleBackfill = useCallback(async () => {
    if (!client || isBusyRef.current) return;
    isBusyRef.current = true;
    setIsBusy(true);
    try {
      const result = await backfillQuickFilter(client, draft, currentMailboxId);
      if (result.matched === 0) {
        toast.success(t("backfill_none"));
      } else {
        toast.success(t("backfill_result", { count: result.matched }));
      }
      if (result.reachedLimit) {
        toast.warning(t("backfill_limited", { count: result.scanned }));
      }
      onClose();
    } catch {
      toast.error(t("backfill_failed"));
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  }, [client, draft, currentMailboxId, onClose, t]);

  const handleCreate = useCallback(() => {
    const rule = buildQuickFilterRule(draft, fieldLabel);
    if (!rule) return;
    void persist(rule);
  }, [draft, fieldLabel, persist]);

  if (showAdvanced) {
    return (
      <FilterRuleModal
        rule={buildQuickFilterDraftRule(draft, fieldLabel)}
        mailboxes={mailboxes}
        mode="create"
        onSave={(rule) => void persist(rule)}
        onClose={onClose}
      />
    );
  }

  const canCreate = loadState === "ready" && !isBusy && isQuickFilterDraftComplete(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        data-testid="quick-filter-modal"
        className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground hover:text-foreground"
            aria-label={tFilters("cancel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "edit" ? (
          <>
            <div className="px-6 py-4 space-y-5">
              {loadState === "failed" && (
                <p className="text-sm text-destructive">{t("load_failed")}</p>
              )}
              {loadState === "opaque" && (
                <p className="text-sm text-muted-foreground">{t("opaque")}</p>
              )}

              <QuickFilterForm draft={draft} onChange={setDraft} mailboxes={mailboxes} />

              <p className="text-xs text-muted-foreground">{t("applies_to_new_mail")}</p>
            </div>

            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border">
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-sm text-primary hover:underline"
              >
                {t("advanced")}
              </button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>
                  {tFilters("cancel")}
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  data-testid="quick-filter-create"
                >
                  {(loadState === "loading" || isBusy) && (
                    <Loader2 className="w-4 h-4 me-1.5 animate-spin" />
                  )}
                  {t("create")}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-4">
              <p className="text-sm text-foreground">{t("backfill_question")}</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={onClose} disabled={isBusy}>
                {t("backfill_skip")}
              </Button>
              <Button
                onClick={() => void handleBackfill()}
                disabled={isBusy}
                data-testid="quick-filter-backfill"
              >
                {isBusy && <Loader2 className="w-4 h-4 me-1.5 animate-spin" />}
                {t("backfill_apply")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
