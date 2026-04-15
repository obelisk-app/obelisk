
import { nip44 } from 'nostr-tools';
console.log('nip44.decrypt length:', nip44.decrypt.length);
// Try to see if it's (privkey, pubkey, payload) or (payload, conversationKey)
try {
    // @ts-ignore
    nip44.decrypt('a', 'b', 'c');
} catch (e: any) {
    console.log('nip44.decrypt error with 3 args:', e.message);
}
