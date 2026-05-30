import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QRDisplay({ value, size = 320 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(console.error);
  }, [value, size]);
  return <canvas ref={ref} aria-label="QR code" className="rounded-lg shadow-lg bg-white" />;
}

export function CountdownRing({ seconds, total = 30 }: { seconds: number; total?: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, seconds) / total);
  return (
    <div className="relative w-20 h-20" aria-label={`${seconds} seconds remaining`}>
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-bold text-lg">
        {seconds}
      </div>
    </div>
  );
}
