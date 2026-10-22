// Honest placeholder for screens whose features arrive in later phases
// (History/Reports in Phase 5, Analytics in Phase 6). No fake data is shown.
import React from "react";

export default function Placeholder({ title, phase }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="muted">This section is implemented in {phase}.</p>
    </div>
  );
}
