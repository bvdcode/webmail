"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useKeywordFormat } from "@/hooks/use-keyword-format";
import { toast } from "@/stores/toast-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFilterStore } from "@/stores/filter-store";
import { useSettingsStore } from "@/stores/settings-store";
import { buildSieveMailboxOptions } from "@/lib/sieve/mailbox-paths";
import {
  QUICK_FILTER_ACTIONS,
  QUICK_FILTER_FIELDS,
  buildQuickFilterDraftRule,
  buildQuickFilterRule,
  createQuickFilterDraft,
  isQuickFilterDraftComplete,
  type QuickFilterActionType,
  type QuickFilterConditionDraft,
  type QuickFilterDraft,
  type QuickFilterField,
} from "@/lib/sieve/quick-filter";
import type { Email, Mailbox } from "@/lib/jmap/types";
import type { FilterRule } from "@/lib/jmap/sieve-types";
import { FilterRuleModal } from "./filter-rule-modal";

interface QuickFilterModalProps {
  email: Email;
  mailboxes: Mailbox[];
  onClose: () => void;
}

type LoadState = "loading" | "ready" | "failed" | "opaque";

const selectClass =
  "px-2.5 py-1.5 text-sm rounded-md bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-150 cursor-pointer hover:border-muted-foreground";

function CheckRow({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 flex-wrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-input"
      />
      <span className="text-sm text-foreground w-20 shrink-0">{label}</span>
      {children}
    </label>
  );
}

export function QuickFilterModal({ email, mailboxes, onClose }: QuickFilterModalProps) {
  const t = useTranslations("quick_filter");
  // Field, comparator and action names are the vocabulary the full rule editor
  // already ships in every locale.
  const tFilters = useTranslations("settings.filters");
  const tNotifications = useTranslations("notifications");
  const client = useAuthStore((state) => state.client);
  const emailKeywords = useSettingsStore((state) => state.emailKeywords);
  const { tagName } = useKeywordFormat();

  const [draft, setDraft] = useState<QuickFilterDraft>(() => createQuickFilterDraft(email));
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isSavingRef = useRef(false);

  const modalRef = useFocusTrap({ isActive: !showAdvanced, onEscape: onClose });

  const { mailboxes: folderOptions, pathMap } = useMemo(
    () => buildSieveMailboxOptions(mailboxes),
    [mailboxes]
  );

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

  const updateCondition = (
    field: QuickFilterField,
    updates: Partial<QuickFilterConditionDraft>
  ) => {
    setDraft((prev) => ({
      ...prev,
      conditions: { ...prev.conditions, [field]: { ...prev.conditions[field], ...updates } },
    }));
  };

  const toggleAction = (action: QuickFilterActionType, enabled: boolean) => {
    setDraft((prev) => ({ ...prev, actions: { ...prev.actions, [action]: enabled } }));
  };

  const persist = useCallback(
    async (rule: FilterRule) => {
      // The full editor's Save button has no busy state of its own, so a second
      // click must not append the rule twice.
      if (!client || isSavingRef.current) return;
      isSavingRef.current = true;
      const previousRules = useFilterStore.getState().rules;
      useFilterStore.getState().addRule(rule);
      setIsSaving(true);
      try {
        await useFilterStore.getState().saveFilters(client);
        toast.success(tNotifications("filters_saved"));
        onClose();
      } catch {
        useFilterStore.setState({ rules: previousRules });
        toast.error(tNotifications("filters_save_failed"));
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    },
    [client, onClose, tNotifications]
  );

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

  const canCreate = loadState === "ready" && !isSaving && isQuickFilterDraftComplete(draft);

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

        <div className="px-6 py-4 space-y-5">
          {loadState === "failed" && <p className="text-sm text-destructive">{t("load_failed")}</p>}
          {loadState === "opaque" && (
            <p className="text-sm text-muted-foreground">{t("opaque")}</p>
          )}

          <div>
            <label className="text-sm font-medium mb-2 block text-foreground">
              {tFilters("conditions")}
            </label>
            <div className="space-y-2">
              {QUICK_FILTER_FIELDS.map((field) => (
                <CheckRow
                  key={field}
                  checked={draft.conditions[field].enabled}
                  onChange={(enabled) => updateCondition(field, { enabled })}
                  label={fieldLabel(field)}
                >
                  <span className="text-xs text-muted-foreground shrink-0">
                    {tFilters("comparators.contains")}
                  </span>
                  <Input
                    value={draft.conditions[field].value}
                    onChange={(e) => updateCondition(field, { value: e.target.value })}
                    onFocus={() => updateCondition(field, { enabled: true })}
                    className="flex-1 min-w-[140px]"
                  />
                </CheckRow>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block text-foreground">
              {tFilters("actions")}
            </label>
            <div className="space-y-2">
              {QUICK_FILTER_ACTIONS.map((action) => (
                <CheckRow
                  key={action}
                  checked={draft.actions[action]}
                  onChange={(enabled) => toggleAction(action, enabled)}
                  label={tFilters(`action_types.${action}`)}
                >
                  {action === "move" && (
                    <select
                      value={draft.mailboxPath}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mailboxPath: e.target.value,
                          actions: { ...prev.actions, move: true },
                        }))
                      }
                      className={`${selectClass} flex-1 min-w-[160px]`}
                      aria-label={tFilters("move_to_folder")}
                    >
                      <option value="">{tFilters("move_to_folder")}</option>
                      {folderOptions.map((mailbox) => (
                        <option key={mailbox.id} value={pathMap.get(mailbox.id) || mailbox.name}>
                          {"\u00A0".repeat(mailbox.depth * 3)}{mailbox.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {action === "add_label" && (
                    <select
                      value={draft.labelId}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          labelId: e.target.value,
                          actions: { ...prev.actions, add_label: true },
                        }))
                      }
                      className={`${selectClass} flex-1 min-w-[160px]`}
                      aria-label={tFilters("label_placeholder")}
                    >
                      <option value="">{tFilters("label_placeholder")}</option>
                      {emailKeywords.map((keyword) => (
                        <option key={keyword.id} value={keyword.id}>
                          {tagName(keyword.id)}
                        </option>
                      ))}
                    </select>
                  )}
                </CheckRow>
              ))}
            </div>
          </div>

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
            <Button onClick={handleCreate} disabled={!canCreate} data-testid="quick-filter-create">
              {(loadState === "loading" || isSaving) && (
                <Loader2 className="w-4 h-4 me-1.5 animate-spin" />
              )}
              {t("create")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
