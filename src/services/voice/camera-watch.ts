/**
 * Whether this device has more than one camera, kept current as devices
 * come and go. Only the switch-camera button depends on it.
 */
import { hasMultipleCameras } from '@/utils/voice/camera-devices';

/**
 * Enumerate the media devices now and on every `devicechange`, calling
 * `onResult` with whether there are two cameras or more. A failed
 * enumeration is logged and leaves the last answer standing. Returns the
 * unsubscribe; no answer is delivered after it runs.
 */
export function watchMultipleCameras(onResult: (multiple: boolean) => void): () => void {
  let cancelled = false;
  const check = async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      if (cancelled) return;
      onResult(hasMultipleCameras(devices));
    } catch (err) {
      // Only the switch-camera button depends on this; say why it is missing.
      console.warn('[voice] enumerateDevices failed; the switch-camera button stays hidden', err);
    }
  };
  void check();
  const onChange = () => { void check(); };
  navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
  return () => {
    cancelled = true;
    navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  };
}
