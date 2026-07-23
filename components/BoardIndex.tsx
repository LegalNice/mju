"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Case } from "@/lib/mju-models";
import { AppNav } from "./AppNav";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

interface ProjectSummary {
  cwd: string;
}

/**
 * /board 索引页：优先回到 localStorage 记录的上次案件，
 * 否则取最近更新的项目的第一个活跃案件；都没有则显示空状态。
 */
export function BoardIndex() {
  const router = useRouter();
  const [resolved, setResolved] = useState<"pending" | "empty">("pending");

  useEffect(() => {
    let cancelled = false;

    const go = (cwd: string, caseId: string) => {
      router.replace(`/board/${caseId}?cwd=${encodeURIComponent(cwd)}`);
    };

    async function resolve() {
      try {
        const raw = localStorage.getItem("mju-last-case");
        if (raw) {
          const last = JSON.parse(raw) as { cwd?: string; caseId?: string };
          if (last.cwd && last.caseId) {
            go(last.cwd, last.caseId);
            return;
          }
        }
      } catch {
        // 记录损坏则继续走项目解析
      }

      try {
        const projectsRes = await fetch("/api/projects");
        if (!projectsRes.ok) throw new Error(`projects ${projectsRes.status}`);
        const { projects } = (await projectsRes.json()) as { projects: ProjectSummary[] };
        const project = projects[0]; // API 已按 updatedAt 倒序
        if (!project) {
          if (!cancelled) setResolved("empty");
          return;
        }
        const casesRes = await fetch(`/api/cases?cwd=${encodeURIComponent(project.cwd)}`);
        if (!casesRes.ok) throw new Error(`cases ${casesRes.status}`);
        const { cases } = (await casesRes.json()) as { cases: Case[] };
        const first = cases.find((c) => c.status === "active");
        if (!first) {
          if (!cancelled) setResolved("empty");
          return;
        }
        go(project.cwd, first.id);
      } catch {
        if (!cancelled) setResolved("empty");
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <AppNav boardHref="/board" />
      {resolved === "pending" ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ ...MICRO, color: "var(--text-dim)" }}>加载中…</span>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <span style={{ ...MICRO, color: "var(--text-dim)" }}>Board</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>暂无案件</span>
          <Link href="/" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            返回首页发起任务 →
          </Link>
        </div>
      )}
    </div>
  );
}
