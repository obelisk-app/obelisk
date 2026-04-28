# The Future: 100% Decentralized Groups on Nostr

Obelisk is currently a **hybrid** application. It uses Nostr purely for **Identity and Authentication** (login, profiles, display names), but relies on a centralized PostgreSQL database and Socket.io server for messages, channels, and roles. This guarantees a highly responsive, low-latency Discord-like experience (including Voice channels) today, but requires a central server.

To make Obelisk (or any Discord-like app) **100% decentralized** on Nostr in the future, the architecture must transition away from centralized databases and rely entirely on Nostr Relays and standardized Nostr Implementation Possibilities (NIPs).

Here is exactly how true decentralized groups on Nostr are being built:

## 1. NIP-29: Relay-based Groups (The Likely Future)
This is the most promising standard for a Discord-like experience. Instead of an Obelisk server managing the group, a **Nostr Relay itself acts as the group manager**.

* **How it works:** A group is hosted on a specific relay (or a small set of fallback relays).
* **Access Control:** The relay software itself enforces moderation. If you try to send a message to the group but you don't have the "member" role, the relay rejects your event.
* **Roles & Moderation:** Admins send specific Nostr events to the relay to assign roles (e.g., "give pubkey X moderator permissions").
* **Why it's better:** Anyone can spin up a NIP-29 relay. You aren't tied to an Obelisk server; your client just connects to the relay that hosts the group.

## 2. NIP-28: Public Chats (The Legacy Way)
This standard already exists and is used by apps like Amethyst and Coracle.

* Someone publishes a `kind 40` event to create a channel.
* Users publish `kind 42` events to send messages into that channel.
* **The problem:** It is completely open. Anyone can spam it, and you cannot kick or ban people easily because anyone can publish a `kind 42` event to any relay. It relies completely on clients choosing to "mute" spammers, which makes it very hard to run a structured, moderated community like a Discord server.

## 3. Private Encrypted Groups (The Hard Problem)
For private Discord servers (where messages are encrypted and only readable by members), true decentralization requires **Group Encryption Keys**.

* The group owner generates a shared symmetric encryption key.
* The owner securely distributes this key to members using **NIP-59 (Gift Wrap)**.
* When a member sends a message, they encrypt it with the group key and publish it to the relays.
* Only people holding the group key can decrypt and read the chat history.

## The Roadmap for Obelisk
To eventually become fully decentralized, Obelisk would phase out its PostgreSQL database and Socket.io server and transition into a **pure Nostr client**.

1. It would read/write `NIP-29` events to interact with Relay-managed groups.
2. Voice channels would transition to peer-to-peer WebRTC signaling sent over Nostr relays (using ephemeral events), rather than a centralized audio relay.

By taking the "hybrid" approach today, Obelisk proves the UX of Nostr identity while waiting for standards like NIP-29 and decentralized WebRTC signaling to fully mature.
