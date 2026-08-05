"use client";

import { useEffect, useState } from "react";
import { ChangelogConfig } from "@/components/ChangelogConfig";
import { localDateString } from "@/lib/date-risk";

const LS_CHANGELOG_VERSION = "mju-changelog-seen-version";
const LS_CHANGELOG_DATE = "mju-changelog-seen-date";

/**
 * 全局更新提示：挂在根布局上，任意页面首次加载时检查一次。
 *
 * 每个自然日首次打开展示一次；同日安装新版本也立即展示新版本说明，
 * 避免用户从书签/恢复跳转直接落在看板、Dates 等页面而错过更新提示。
 * 记录逻辑与原 EntryPage 内联逻辑一致（展示即记录，同日不再重复）。
 */
export function ChangelogPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const today = localDateString(new Date());

    const tryOpen = (version: string) => {
      try {
        const isNewDay = localStorage.getItem(LS_CHANGELOG_DATE) !== today;
        const isNewVersion = Boolean(version && localStorage.getItem(LS_CHANGELOG_VERSION) !== version);
        if (isNewDay || isNewVersion) {
          setOpen(true);
          localStorage.setItem(LS_CHANGELOG_DATE, today);
          if (version) localStorage.setItem(LS_CHANGELOG_VERSION, version);
        }
      } catch {
        // Storage can be unavailable in restricted browser contexts.
      }
    };

    // 生产构建在编译期内联了版本号；dev/源码运行可能为空，回退到运行时版本。
    const baked = process.env.NEXT_PUBLIC_APP_VERSION;
    if (baked) {
      tryOpen(baked);
      return;
    }
    fetch("/api/changelog")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { version?: string } | null) => {
        if (!cancelled && data?.version) tryOpen(data.version);
      })
      .catch(() => {
        // 网络不可用时静默，下次加载再试。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;
  return <ChangelogConfig onClose={() => setOpen(false)} />;
}
