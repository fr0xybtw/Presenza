import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function QRScanner({ onScan, onError }: { onScan: (text: string) => void; onError?: (e: string) => void }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const id = "qr-reader-" + Math.random().toString(36).slice(2);
    elRef.current.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text) => {
          if (stopped) return;
          stopped = true;
          scanner.stop().then(() => scanner.clear()).catch(() => {});
          onScan(text);
        },
        () => {},
      )
      .catch((err) => {
        onError?.(typeof err === "string" ? err : (err?.message ?? "Camera error"));
      });

    return () => {
      stopped = true;
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [onScan, onError]);

  return <div ref={elRef} className="w-full max-w-sm mx-auto rounded-lg overflow-hidden border" />;
}
