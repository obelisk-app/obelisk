/** True when the device list holds more than one camera (the switch-camera button needs two). */
export function hasMultipleCameras(devices: ReadonlyArray<Pick<MediaDeviceInfo, 'kind'>> | null | undefined): boolean {
  return (devices ?? []).filter((d) => d.kind === 'videoinput').length > 1;
}
