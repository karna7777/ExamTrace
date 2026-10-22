// Simple reusable in-app modal overlay. Used for the examiner unlock prompt
// (and later for in-app exam submission confirmation).
import React from "react";

export default function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          {onClose && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
