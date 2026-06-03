/**
 * Mantra MFS100 RD Service client.
 *
 * The RD Service (Registered Device Service) is a local HTTP daemon
 * shipped with the Mantra driver bundle. It listens on localhost:11100
 * (the SDK probes 11100..11104 to find a free port; we hit the default
 * here, with a quick fallback scan).
 *
 * Real RD Services speak XML over HTTP with custom verbs (RDSERVICE,
 * CAPTURE, DEVICEINFO). This wrapper exposes a small JSON-ish surface
 * suited to our marking + enrollment flows. If your deployment uses
 * the canonical XML protocol, swap the request bodies in `probeStatus`
 * and `capture` accordingly — the rest of the app only depends on the
 * three exported functions.
 */

const DEFAULT_PORT = 11100;
const PROBE_PORTS = [11100, 11101, 11102, 11103, 11104];

export interface ScannerInfo {
  available: boolean;
  port: number;
  deviceModel?: string;
  serialNumber?: string;
  firmware?: string;
  message?: string;
}

export interface CaptureResult {
  fingerprintTemplate: string; // base64 ISO/IEC 19794-2
  quality?: number; // NFIQ score 1-5 if reported
  capturedAt: string;
  port: number;
}

export class MantraError extends Error {
  constructor(
    message: string,
    public code:
      | 'NOT_RUNNING'
      | 'TIMEOUT'
      | 'NO_FINGER'
      | 'BAD_RESPONSE'
      | 'CANCELLED',
  ) {
    super(message);
    this.name = 'MantraError';
  }
}

/**
 * GET /rd/info — checks that the service is alive on the given port.
 * Returns the first port that responds; if none respond, returns
 * { available: false, port: DEFAULT_PORT }.
 */
export async function probeStatus(): Promise<ScannerInfo> {
  for (const port of PROBE_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/rd/info`, {
        method: 'GET',
        // Use a short timeout via AbortController so a closed port
        // doesn't stall the UI.
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) continue;
      const j = await res.json().catch(() => ({}));
      return {
        available: true,
        port,
        deviceModel: j?.device ?? j?.model ?? 'Mantra MFS100',
        serialNumber: j?.serial,
        firmware: j?.firmware,
        message: j?.status,
      };
    } catch {
      // try next port
    }
  }
  return {
    available: false,
    port: DEFAULT_PORT,
    message: 'No RD Service responding on ports 11100-11104',
  };
}

/**
 * POST /rd/capture — instructs the device to wait for a finger and
 * returns the base64 template.
 *
 * @param opts.timeoutMs how long to wait for a finger before giving up
 * @param opts.signal AbortSignal to cancel the capture (e.g. tab-close)
 */
export async function capture(opts: {
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}): Promise<CaptureResult> {
  const timeoutMs = opts.timeoutMs ?? 10000;

  const status = await probeStatus();
  if (!status.available) {
    throw new MantraError(
      'Mantra RD Service is not running. Install the driver and start the service.',
      'NOT_RUNNING',
    );
  }

  // Combine caller-provided abort with our own timeout so either fires.
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(`http://localhost:${status.port}/rd/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'ISO_19794_2',
        timeoutMs,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new MantraError(
        `RD Service returned ${res.status}`,
        'BAD_RESPONSE',
      );
    }

    const j = (await res.json()) as {
      template?: string;
      data?: string;
      quality?: number;
      errorCode?: string;
      errorMessage?: string;
    };

    if (j.errorCode) {
      const code: MantraError['code'] =
        j.errorCode === 'TIMEOUT' || j.errorCode === '700'
          ? 'TIMEOUT'
          : j.errorCode === 'NO_FINGER' || j.errorCode === '701'
            ? 'NO_FINGER'
            : 'BAD_RESPONSE';
      throw new MantraError(j.errorMessage ?? 'Capture failed', code);
    }

    const template = j.template ?? j.data;
    if (!template) {
      throw new MantraError('No template in RD response', 'BAD_RESPONSE');
    }

    return {
      fingerprintTemplate: template,
      quality: j.quality,
      capturedAt: new Date().toISOString(),
      port: status.port,
    };
  } catch (err) {
    if (err instanceof MantraError) throw err;
    if (
      err instanceof DOMException &&
      (err.name === 'AbortError' || err.name === 'TimeoutError')
    ) {
      throw new MantraError(
        opts.signal?.aborted
          ? 'Capture cancelled'
          : 'No finger detected within the timeout window',
        opts.signal?.aborted ? 'CANCELLED' : 'TIMEOUT',
      );
    }
    throw new MantraError(
      err instanceof Error ? err.message : 'Capture failed',
      'NOT_RUNNING',
    );
  } finally {
    window.clearTimeout(tid);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Simple "is the service running right now" helper for status pills.
 * Cheaper than capture() because it just does the info probe.
 */
export async function isAvailable(): Promise<boolean> {
  return (await probeStatus()).available;
}

/**
 * Generate a deterministic fake template for the demo flow. We don't
 * use random bytes here because the backend's `markFingerprint` accepts
 * the captured template only as audit metadata — matching is done from
 * the supplied uniqueId. Returning a stable, base64-padded ASCII
 * payload keeps the audit row readable and large enough to pass the
 * "≥32 chars" sanity check.
 */
export function fakeCapture(): CaptureResult {
  const seed =
    'JANSEVA-DEMO-FINGERPRINT-v1-' +
    Math.floor(Date.now() / 1000).toString();
  const template = btoa(seed.padEnd(64, '*'));
  return {
    fingerprintTemplate: template,
    quality: 88, // arbitrary plausible NFIQ-ish number
    capturedAt: new Date().toISOString(),
    port: 0, // 0 = synthetic / not from the RD service
  };
}
