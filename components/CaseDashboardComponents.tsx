import type { CSSProperties, ReactNode } from "react";
import type { Case, CaseStageHistoryEntry, Deadline, Deliverable, DeliverableStatus, Task } from "@/lib/mju-models";

const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  draft: "草稿",
  "internal-review": "内审",
  "client-review": "客户审",
  final: "定稿",
  archived: "归档",
};

/**
 * Narrow extension for callers whose Case projection includes workflow progress.
 * The base Case model remains usable everywhere else.
 */
export type CaseWithStageProgress = Case;

export interface CaseStageDefinition {
  id: string;
  label: string;
  description?: string;
}

export interface CaseStageProgressProps {
  caseItem: CaseWithStageProgress;
  /** Ordered workflow stages. These are intentionally supplied by the parent. */
  stages: readonly CaseStageDefinition[];
  title?: string;
  emptyLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveStageIndex(caseItem: CaseWithStageProgress, stages: readonly CaseStageDefinition[]): number {
  if (stages.length === 0) return -1;
  if (typeof caseItem.stageIndex === "number" && Number.isFinite(caseItem.stageIndex)) {
    return clamp(Math.trunc(caseItem.stageIndex), 0, stages.length - 1);
  }
  const current = stages.findIndex((stage) => stage.id === caseItem.stage);
  return current >= 0 ? current : 0;
}

function formatShortDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

/** A static, ordered case-stage indicator with no persistence or event handling. */
export function CaseStageProgress({
  caseItem,
  stages,
  title = "案件阶段",
  emptyLabel = "尚未配置阶段",
}: CaseStageProgressProps) {
  if (stages.length === 0) return <SectionLabel title={title} trailing={emptyLabel} />;

  const currentIndex = resolveStageIndex(caseItem, stages);
  const historyByStage = new Map((caseItem.stageHistory ?? []).map((entry) => [entry.stage, entry]));

  return (
    <section className="case-stage-route" aria-label={title}>
      <div className="case-stage-route-header">
        <SectionLabel title={title} trailing={`${currentIndex + 1}/${stages.length}`} />
      </div>
      <ol
        className="case-stage-route-list"
        style={{ "--case-stage-count": stages.length } as CSSProperties}
      >
        {stages.map((stage, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;
          const entry: CaseStageHistoryEntry | undefined = historyByStage.get(stage.id);
          const date = formatShortDate(entry?.changedAt);
          return (
            <li
              key={stage.id}
              className={`case-stage-route-step${isCurrent ? " is-current" : ""}${isComplete ? " is-complete" : ""}`}
            >
              <span className="case-stage-route-dot" aria-current={isCurrent ? "step" : undefined} />
              <span className="case-stage-route-name" title={stage.label}>{stage.label}</span>
              {(date || stage.description) && (
                <span className="case-stage-route-date">{date ?? stage.description}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export type CaseRiskLevel = "critical" | "warning" | "monitor" | "info";

export interface CaseRisk {
  id: string;
  title: string;
  level: CaseRiskLevel;
  detail?: string;
  dueDate?: string;
  source?: string;
}

export interface CaseRiskSummaryProps {
  risks: readonly CaseRisk[];
  title?: string;
  emptyLabel?: string;
  /** Limits the detailed list while preserving aggregate severity counts. */
  maxItems?: number;
  /** Renders an aside landmark for placement in a dashboard sidebar. */
  asSidebar?: boolean;
}

const RISK_LABEL: Record<CaseRiskLevel, string> = {
  critical: "紧急",
  warning: "关注",
  monitor: "跟进",
  info: "提示",
};

/** Pure risk presentation; calculation and fetching remain with the parent dashboard. */
export function CaseRiskSummary({
  risks,
  title = "风险提示",
  emptyLabel = "暂无待关注事项",
  maxItems = 4,
  asSidebar = true,
}: CaseRiskSummaryProps) {
  const visible = risks.slice(0, Math.max(0, maxItems));
  const critical = risks.filter((risk) => risk.level === "critical").length;
  const warning = risks.filter((risk) => risk.level === "warning").length;
  const Wrapper = asSidebar ? "aside" : "section";

  return (
    <Wrapper className="case-risk-summary" aria-label={title}>
      <SectionLabel title={title} trailing={risks.length > 0 ? `${risks.length}` : undefined} />
      {risks.length > 0 && (
        <div className="case-risk-counts">
          {critical > 0 && <span className="is-urgent">{critical} 项紧急</span>}
          {warning > 0 && <span>{warning} 项关注</span>}
        </div>
      )}
      {visible.length === 0 ? (
        <div className="case-empty-note">{emptyLabel}</div>
      ) : (
        <ul className="case-dossier-list case-risk-list">
          {visible.map((risk) => (
            <li key={risk.id} className={`case-dossier-row case-risk-row is-${risk.level}`}>
              <div className="case-risk-content">
                <span className="case-dossier-row-title">{risk.title}</span>
                {(risk.detail || risk.dueDate || risk.source) && (
                  <span className="case-risk-detail">
                    {[risk.detail, risk.dueDate ? `截止 ${formatShortDate(risk.dueDate) ?? risk.dueDate}` : undefined, risk.source]
                      .filter((value): value is string => Boolean(value))
                      .join(" · ")}
                  </span>
                )}
              </div>
              <span className="case-risk-level">{RISK_LABEL[risk.level]}</span>
            </li>
          ))}
        </ul>
      )}
      {risks.length > visible.length && (
        <div className="case-list-more">另有 {risks.length - visible.length} 项</div>
      )}
    </Wrapper>
  );
}

/** Explicit alias for consumers that prefer a layout-oriented sidebar name. */
export const CaseRiskSidebar = CaseRiskSummary;

export type CaseTimelineEventKind = "stage" | "task" | "deadline" | "document" | "note";

export interface CaseTimelineEvent {
  id: string;
  date: string;
  title: string;
  kind: CaseTimelineEventKind;
  detail?: string;
  overdue?: boolean;
  href?: string;
  meta?: string;
}

export interface CaseTimelineProps {
  events: readonly CaseTimelineEvent[];
  title?: string;
  emptyLabel?: string;
  maxItems?: number;
}

const TIMELINE_KIND_LABEL: Record<CaseTimelineEventKind, string> = {
  stage: "阶段",
  task: "任务",
  deadline: "期限",
  document: "文书",
  note: "记录",
};

/** Chronological, link-capable case activity display. Events are sorted by their supplied dates. */
export function CaseTimeline({
  events,
  title = "案件时间线",
  emptyLabel = "暂无时间线记录",
  maxItems,
}: CaseTimelineProps) {
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const visible = typeof maxItems === "number" ? sorted.slice(0, Math.max(0, maxItems)) : sorted;

  return (
    <section aria-label={title}>
      <SectionLabel title={title} trailing={events.length > 0 ? `${events.length}` : undefined} />
      {visible.length === 0 ? (
        <div className="case-empty-note">{emptyLabel}</div>
      ) : (
        <ol className="case-timeline">
          {visible.map((event) => {
            const content: ReactNode = (
              <>
                <div className="case-timeline-title">{event.title}</div>
                <div className="case-timeline-meta">
                  <span>{formatShortDate(event.date) ?? event.date}</span>
                  <span>{TIMELINE_KIND_LABEL[event.kind]}</span>
                  {event.detail && <span>{event.detail}</span>}
                  {event.meta && <span>{event.meta}</span>}
                </div>
              </>
            );

            return (
              <li key={event.id} className={`case-timeline-item${event.overdue ? " is-urgent" : ""}`}>
                {event.href ? <a href={event.href} className="case-timeline-link">{content}</a> : content}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export interface CaseDocumentSummaryProps {
  deliverables: readonly Deliverable[];
  title?: string;
  emptyLabel?: string;
  maxItems?: number;
  /** Optional path-to-link conversion supplied by the consuming dashboard. */
  documentHref?: (deliverable: Deliverable) => string | undefined;
  /** Lets the dashboard retain its existing status workflow without putting state here. */
  onAdvance?: (deliverable: Deliverable) => void;
  advancingId?: string | null;
  error?: string | null;
}

function documentTypeLabel(type: Deliverable["type"]): string {
  const labels: Record<Deliverable["type"], string> = {
    "internal-opinion": "内部意见",
    "external-opinion": "对外意见",
    "docx-revision": "修订稿",
    pleading: "诉讼文书",
    "evidence-list": "证据清单",
    "trial-outline": "庭审提纲",
    "research-report": "检索报告",
    other: "其他",
  };
  return labels[type];
}

/** Deliverable inventory and lifecycle summary without document loading or state transitions. */
export function CaseDocumentSummary({
  deliverables,
  title = "交付物",
  emptyLabel = "暂无交付物",
  maxItems,
  documentHref,
  onAdvance,
  advancingId,
  error,
}: CaseDocumentSummaryProps) {
  const sorted = [...deliverables].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = typeof maxItems === "number" ? sorted.slice(0, Math.max(0, maxItems)) : sorted;
  const finalCount = deliverables.filter((item) => item.status === "final" || item.status === "archived").length;

  return (
    <section aria-label={title}>
      <SectionLabel title={title} trailing={deliverables.length > 0 ? `${finalCount}/${deliverables.length} 定稿` : undefined} />
      {visible.length === 0 ? (
        <div className="case-empty-note">{emptyLabel}</div>
      ) : (
        <div className="case-dossier-list">
          {visible.map((deliverable) => {
            const href = documentHref?.(deliverable);
            const archived = deliverable.status === "archived";
            const busy = advancingId === deliverable.id;
            const metadata = `${documentTypeLabel(deliverable.type)} · v${deliverable.version}`;
            const row = (
              <>
                <span className="case-document-row-title" title={deliverable.title}>{deliverable.title}</span>
                <span className="case-document-row-meta">{metadata}</span>
              </>
            );
            return (
              <div key={deliverable.id} className="case-document-entry">
                {href ? (
                  <a href={href} className="case-document-row">{row}</a>
                ) : (
                  <div className="case-document-row">{row}</div>
                )}
                <button
                  type="button"
                  disabled={!onAdvance || archived || busy}
                  onClick={() => onAdvance?.(deliverable)}
                  className={`case-document-status is-${deliverable.status}`}
                  title={archived ? "已归档" : "点击推进状态"}
                >
                  {busy ? "更新中…" : DELIVERABLE_STATUS_LABEL[deliverable.status]}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {deliverables.length > visible.length && (
        <div className="case-list-more">显示 {visible.length}/{deliverables.length}</div>
      )}
      {error && <div role="alert" className="case-list-error">{error}</div>}
    </section>
  );
}

/** Small shared section header matching the existing CaseBoardView micro-label idiom. */
function SectionLabel({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <div className="case-section-label">
      <span>{title}</span>
      {trailing && <span>{trailing}</span>}
    </div>
  );
}

/** Convenience input shape for parents assembling a timeline from existing board data. */
export type CaseTimelineSource = Pick<Task, "id" | "title" | "deadline" | "status"> | Pick<Deadline, "id" | "title" | "date" | "status">;
