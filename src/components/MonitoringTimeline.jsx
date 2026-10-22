// Renders a chronological list of monitoring events. Used live in the exam
// workspace (compact) and in the result report (full). Shows recorded facts
// with neutral classifications - never an accusation.
import React from "react";
import { describeEvent, formatClock } from "../api.js";

export default function MonitoringTimeline({ events, compact }) {
  if (!events || events.length === 0) {
    return <p className="muted">No activity events recorded.</p>;
  }

  // Newest first in compact (live) view; chronological in the full report.
  const ordered = compact ? [...events].reverse() : events;

  return (
    <ul className={"timeline" + (compact ? " compact" : "")}>
      {ordered.map((ev) => {
        const info = describeEvent(ev.type);
        const awayMs = ev.metadata && ev.metadata.awayMs;
        const idleMs = ev.metadata && ev.metadata.idleMs;
        return (
          <li key={ev.id} className={"timeline-item kind-" + info.kind}>
            <span className="timeline-time">{formatClock(ev.timestamp)}</span>
            <span className="timeline-dot" />
            <span className="timeline-label">
              {info.label}
              {awayMs ? " · away " + Math.round(awayMs / 1000) + "s" : ""}
              {idleMs ? " · idle " + Math.round(idleMs / 1000) + "s" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
