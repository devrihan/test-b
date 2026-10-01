"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, RefreshCw } from "lucide-react";

let html5QrcodeModule: typeof import("html5-qrcode") | null = null;
const preloadLib = () =>
  html5QrcodeModule
    ? Promise.resolve(html5QrcodeModule)
    : import("html5-qrcode").then((m) => { html5QrcodeModule = m; return m; });

function cameraErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (name === "NotAllowedError" || msg.includes("Permission denied") || msg.includes("not allowed"))
    return "Camera permission was denied. Please allow camera access in your browser settings and try again.";
  if (name === "NotFoundError" || msg.includes("Requested device not found"))
    return "No camera found on this device.";
  if (name === "NotReadableError" || msg.includes("Could not start video source"))
    return "Camera is in use by another app. Close it and try again.";
  if (name === "OverconstrainedError")
    return "Rear camera not available. Trying again may use the front camera.";
  if (!navigator.mediaDevices || location.protocol !== "https:" && location.hostname !== "localhost")
    return "Camera requires a secure connection (HTTPS). Ask your admin to enable HTTPS.";
  return "Camera access failed. Check your browser permissions and try again.";
}

interface QrScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export { preloadLib as preloadQrScanner };

export default function QrScanner({ onScan, onClose }: QrScannerProps) {
  const [readerId] = useState(() => `qr-reader-${Date.now()}`);
  const scannerRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const lastScannedRef = useRef<string>("");
  const cooldownRef = useRef(false);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let mounted = true;
    let stopped = false;

    async function safeStop(scanner: { stop?: () => Promise<void>; clear?: () => void } | null) {
      if (stopped || !scanner?.stop) return;
      stopped = true;
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { scanner.clear?.(); } catch { /* ignore */ }
    }

    async function start() {
      setError(null);
      try {
        // Camera API requires a secure context (HTTPS or localhost).
        // On Android Chrome over HTTP, getUserMedia is undefined — no prompt, no error.
        const isSecure = globalThis.isSecureContext
          ?? (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
        if (!isSecure) {
          if (mounted) setError("Camera requires HTTPS. This page is served over HTTP, so the browser blocks camera access. Please access this page using https://.");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          if (mounted) setError("Camera is not supported on this browser. Try Chrome or Safari.");
          return;
        }

        // Explicitly request camera permission first — some Android browsers
        // reject html5-qrcode's internal getUserMedia silently, but honour
        // a standalone prompt. The stream is released immediately; the
        // library opens its own when .start() is called.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        stream.getTracks().forEach(t => t.stop());

        const { Html5Qrcode } = await preloadLib();
        const el = document.getElementById(readerId);
        if (!mounted || !el) return;

        const scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 30, qrbox: { width: 250, height: 250 } },
          (text: string) => {
            if (cooldownRef.current) return;
            if (text === lastScannedRef.current) return;
            cooldownRef.current = true;
            lastScannedRef.current = text;
            onScanRef.current(text);
            setTimeout(() => { cooldownRef.current = false; lastScannedRef.current = ""; }, 1500);
          },
          () => {},
        );
      } catch (err) {
        if (mounted) setError(cameraErrorMessage(err));
      }
    }

    start();

    return () => {
      mounted = false;
      safeStop(scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null);
    };
  }, [readerId, retryCount]);

  const handleRetry = useCallback(() => {
    const scanner = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
    if (scanner?.stop) {
      scanner.stop().catch(() => {}).finally(() => {
        try { scanner.clear?.(); } catch { /* ignore */ }
        scannerRef.current = null;
        setRetryCount(c => c + 1);
      });
    } else {
      setRetryCount(c => c + 1);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Scan QR Code</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {error ? (
          <div className="px-4 py-10 text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          </div>
        ) : (
          <div id={readerId} className="w-full" />
        )}

        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-500">
            Point your camera at QR codes — students are marked automatically
          </p>
        </div>
      </div>
    </div>
  );
}
