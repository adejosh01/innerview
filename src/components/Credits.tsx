import { useEffect, useRef } from "react";

export function Credits({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="credits" onClose={onClose}>
      <h3>About &amp; credits</h3>
      <p>
        Innerview overlays a generic adult anatomy model on your webcam image. It shows typical positions of structures. It is
        not a scan of you and not a medical or diagnostic tool.
      </p>

      <h4 className="eyebrow">Anatomy models</h4>
      <p>
        Skull, brain, eyes, eye muscles, neck spine and sternocleidomastoid are based on <strong>BodyParts3D</strong>, © The
        Database Center for Life Science, licensed under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">
          CC BY-SA 2.1 Japan
        </a>{" "}
        (
        <a href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">
          source
        </a>
        ). The models were simplified, re-aligned to a face-tracking coordinate system and converted to glTF; the modified
        models are available under the same licence.
      </p>
      <p>
        The facial expression and chewing muscles, hand bones and full-body skeleton are simplified illustrative shapes made
        for this app.
      </p>

      <h4 className="eyebrow">Software</h4>
      <p>
        Three.js (MIT) · MediaPipe Tasks Vision (Apache 2.0) · React (MIT). Optional AI tutor powered by Claude (Anthropic).
      </p>

      <h4 className="eyebrow">Privacy</h4>
      <p>
        Face and hand tracking run entirely in your browser. No video or images are uploaded. If you use the AI tutor, only
        your typed question and the selected structure's name are sent.
      </p>

      <div className="actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
