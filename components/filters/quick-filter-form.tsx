"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useKeywordFormat } from "@/hooks/use-keyword-format";
import { useSettingsStore } from "@/stores/settings-store";
import { buildSieveMailboxOptions } from "@/lib/sieve/mailbox-paths";
import {
  QUICK_FILTER_ACTIONS,
  QUICK_FILTER_FIELDS,
  type QuickFilterActionType,
  type QuickFilterDraft,
  type QuickFilterField,
} from "@/lib/sieve/quick-filter";
import type { Mailbox } from "@/lib/jmap/types";

interface QuickFilterFormProps {
  draft: QuickFilterDraft;
  onChange: (update: (previous: QuickFilterDraft) => QuickFilterDraft) => void;
  mailboxes: Mailbox[];
}

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

export function QuickFilterForm({ draft, onChange, mailboxes }: QuickFilterFormProps) {
  // Field, comparator and action names are the vocabulary the full rule editor
  // already ships in every locale.
  const tFilters = useTranslations("settings.filters");
  const emailKeywords = useSettingsStore((state) => state.emailKeywords);
  const { tagName } = useKeywordFormat();

  const { mailboxes: folderOptions, pathMap } = useMemo(
    () => buildSieveMailboxOptions(mailboxes),
    [mailboxes]
  );

  const updateCondition = (field: QuickFilterField, updates: Partial<QuickFilterDraft["conditions"][QuickFilterField]>) => {
    onChange((previous) => ({
      ...previous,
      conditions: { ...previous.conditions, [field]: { ...previous.conditions[field], ...updates } },
    }));
  };

  const toggleAction = (action: QuickFilterActionType, enabled: boolean) => {
    onChange((previous) => ({ ...previous, actions: { ...previous.actions, [action]: enabled } }));
  };

  return (
    <>
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
              label={tFilters(`condition_fields.${field}`)}
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
                  value={draft.mailboxId}
                  onChange={(e) => {
                    const mailboxId = e.target.value;
                    onChange((previous) => ({
                      ...previous,
                      mailboxId,
                      mailboxPath: pathMap.get(mailboxId) ?? "",
                      actions: { ...previous.actions, move: true },
                    }));
                  }}
                  className={`${selectClass} flex-1 min-w-[160px]`}
                  aria-label={tFilters("move_to_folder")}
                >
                  <option value="">{tFilters("move_to_folder")}</option>
                  {folderOptions.map((mailbox) => (
                    <option key={mailbox.id} value={mailbox.id}>
                      {"\u00A0".repeat(mailbox.depth * 3)}{mailbox.name}
                    </option>
                  ))}
                </select>
              )}
              {action === "add_label" && (
                <select
                  value={draft.labelId}
                  onChange={(e) =>
                    onChange((previous) => ({
                      ...previous,
                      labelId: e.target.value,
                      actions: { ...previous.actions, add_label: true },
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
    </>
  );
}
