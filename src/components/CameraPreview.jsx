// Opt-in camera preview shown during an exam when the examiner enables camera
// monitoring. It uses the browser Media API (getUserMedia) in the renderer.
//
// Honest limitations (per spec): this is a visible live preview only. It does
// NOT do face recognition, identity verification or presence detection, and it
// NEVER saves or uploads any frames. The stream is stopped on unmount.
import React, { useEffect, useRef, useState } from "react";

export default function CameraPreview() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          const v = videoRef.current;
          v.srcObject = stream;
          // Set muted via the DOM node (the JSX `muted` prop is unreliable) so the
          // browser allows autoplay; then start playback explicitly. Without this
          // the preview can stay black.
          v.muted = true;
          v.setAttribute("playsinline", "");
          try {
            await v.play();
          } catch {
            // some environments need a tick before play() succeeds
          }
        }
      } catch (err) {
        setError("Camera unavailable or permission denied. Close other apps using the camera and check macOS camera permission.");
      }
    }
    start();

    // Always release the camera when the component unmounts (exam ends).
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="palette camera-panel">
      <h3 className="palette-title">Camera</h3>
      {error ? (
        <p className="muted">{error}</p>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          <p className="camera-note">Live preview · not recorded or uploaded</p>
        </>
      )}
    </div>
  );
}
