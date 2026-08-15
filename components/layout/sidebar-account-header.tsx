"use client";

import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarAccountHeaderProps {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSidebarClose?: () => void;
}

export function SidebarAccountHeader({
  isCollapsed,
  onToggleCollapsed,
  onSidebarClose,
}: SidebarAccountHeaderProps) {
  const t = useTranslations("sidebar");

  return (
    <div
      className={cn(
        "flex items-center h-14 px-2",
        isCollapsed ? "justify-center" : "gap-1",
      )}
      data-testid="sidebar-account-header"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onSidebarClose}
        className="lg:hidden h-9 w-9 flex-shrink-0"
        aria-label={t("close")}
      >
        <X className="w-5 h-5" />
      </Button>

      {!isCollapsed && <AccountSwitcher variant="expanded" className="flex-1" />}

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleCollapsed}
        className="hidden lg:flex h-8 w-8 flex-shrink-0"
        title={isCollapsed ? t("expand_tooltip") : t("collapse_tooltip")}
        aria-label={isCollapsed ? t("expand_tooltip") : t("collapse_tooltip")}
        data-testid="sidebar-collapse-toggle"
      >
        {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
      </Button>
    </div>
  );
}
