import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: Promise<string> | null = null;

export function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve("");
  if (cached) return cached;
  cached = (async () => {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
  })();
  return cached;
}
