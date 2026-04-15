
import * as nostrTools from 'nostr-tools';
console.log('nostr-tools keys:', Object.keys(nostrTools));
if (nostrTools.nip44) {
  console.log('nip44 keys:', Object.keys(nostrTools.nip44));
}
if (nostrTools.nip04) {
  console.log('nip04 keys:', Object.keys(nostrTools.nip04));
}
