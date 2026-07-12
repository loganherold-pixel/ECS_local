const OBD2_NAME_PATTERNS: RegExp[] = [
  /obd/i, /elm\s*327/i, /elm327/i, /v[\-\s]*link/i, /vee\s*peak/i, /veepeak/i, /ve\s*peak/i, /v\s*peak/i, /\bvpake\b/i,
  /bafx/i, /scan\s*tool/i, /carista/i, /obd\s*link/i, /vgate/i,
  /konnwei/i, /fixd/i, /blue\s*driver/i, /torque/i, /le\s*link/i,
  /viecar/i, /thinkcar/i, /autel/i, /icar/i, /launch/i,
  /ancel/i, /foxwell/i, /innova/i, /autophix/i, /xtool/i,
  /obd\s*check/i, /\bvp\s*11\b/i, /\bvp11\b/i, /ios\s*v[\-\s]*link/i, /android\s*v[\-\s]*link/i,
  /car\s*scanner/i, /panlong/i, /micro\s*mechanic/i,
];

// Generic UART services are shared by many unrelated sensors. They become
// valid ELM327 transports only after a name or OBD-specific service identifies
// the adapter.
const OBD2_DISCOVERY_SERVICE_UUIDS = [
  '00001101-0000-1000-8000-00805f9b34fb',
  '1101',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];
const OBD2_DISCOVERY_SERVICE_UUID_KEYS = new Set(
  OBD2_DISCOVERY_SERVICE_UUIDS.map((uuid) => uuid.toLowerCase().replace(/[^a-f0-9]/g, '')),
);

export function isLikelyOBDAdvertisement(name: string, serviceUUIDs?: string[]): boolean {
  if (OBD2_NAME_PATTERNS.some((pattern) => pattern.test(name))) return true;

  return (serviceUUIDs ?? []).some((uuid) => {
    const normalized = uuid.toLowerCase().replace(/[^a-f0-9]/g, '');
    return OBD2_DISCOVERY_SERVICE_UUID_KEYS.has(normalized);
  });
}
