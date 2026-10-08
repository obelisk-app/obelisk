/** Application signing permissions requested during NIP-46 pairing. */
export const OBELISK_NIP46_PERMISSIONS = [
  'nip04_encrypt', 'nip04_decrypt', 'nip44_encrypt', 'nip44_decrypt',
  'nip:1', 'nip:2', 'nip:9', 'nip:17', 'nip:18', 'nip:25', 'nip:29',
  'nip:51', 'nip:57', 'nip:59', 'nip:78', 'nip:98',
  'sign_event:2390', 'sign_event:20078', 'sign_event:22242',
  'sign_event:24242', 'sign_event:25050', 'sign_event:25052',
].join(',');
