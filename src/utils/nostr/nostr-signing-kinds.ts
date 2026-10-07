
export const OBELISK_NIP46_PERMISSIONS = [
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
  ...[1, 2, 9, 17, 18, 25, 29, 51, 57, 59, 78, 98].map((nip) => 'nip:' + nip),
  ...[2390, 20078, 22242, 24242, 25050, 25052].map((kind) => 'sign_event:' + kind),
].join(',');
