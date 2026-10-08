# Chat composer - image & video attachments

## Flow

The channel composer (`src/app/[locale]/app/panes/channel/ChatComposer.tsx` on desktop, `mobile/screens/channel/ChannelComposer.tsx` on the phone, both driven by `src/hooks/chat/composer/useChannelComposer.ts`) accepts media three ways:

1. **Attach button**: opens the OS file picker (`<input type="file" multiple accept="image/*,video/*">`).
2. **Paste**: `onPaste` on the message input scans `clipboardData.items` for files with an `image/*` or `video/*` MIME type.
3. **Inline URLs**: pasting a bare image URL into the text still works; the renderer detects it on the receiving side.

The attach button and paste funnel through `onPickFiles(files: File[])` (`src/hooks/chat/composer/useComposerUploads.ts`), which:

- Caps each batch at **4 files** (`MAX_COMPOSER_ATTACHMENTS`, matching the gallery's 2x2 matrix renderer).
- Uploads in parallel via `uploadToBlossom` from `src/services/media/blossom.ts`.
- Appends each returned URL on its own line at the end of the draft (NIP-92-style: bare image URLs in message content are auto-rendered as media on receive).

Errors surface in `sendError` below the composer; partial-batch failures fail the whole batch (Promise.all). Re-sending after a failure is a manual retry.

## Preview strip

A thumbnail row renders directly above the input bar whenever the draft contains image URLs (detected via `extractUrls` + `isImageUrl` from `@/utils/message-text/markdown`), capped at 4 thumbs. Each thumbnail has an `×` button that removes that URL's line from the draft. While an upload is in flight, a `…` placeholder tile appears next to existing thumbs.

The strip is purely a view over `draft`; there is no separate "pending attachments" state. Removing a thumb is a string edit on `draft`. This keeps the composer single-source-of-truth and avoids drift between what the user sees and what gets sent.

## Rendering on receive

`src/components/chat/message/MessageContent.tsx` extracts image URLs from message content, strips them from the rendered markdown body, and hands the list to `ImageGallery`:

| Count | Layout |
|-------|--------|
| 1 | Single image, natural aspect, `w-fit max-w-sm` (wrapper hugs the image) |
| 2 | Side-by-side, 2:1 wrapper |
| 3 | One large left + two stacked right, square wrapper |
| 4 | 2x2 grid, square wrapper |
| 5+ | 2x2 of first 4; last tile shows `+N` overlay; lightbox carousel paginates the rest |

Tapping any tile opens the lightbox (zoom + pan + arrow-key navigation). See `src/components/chat/gallery/ImageGallery.tsx`.

## Limits & gotchas

- **4-image cap is per batch, not per message.** A user can paste 4, then attach 4 more, and all 8 URLs end up in the draft. The renderer/gallery only shows the first 4 with a `+N` overlay; the remaining URLs still travel in the message body and are reachable via the lightbox carousel.
- **No client-side size check** before upload; Blossom server enforces its own limits and returns an error.
- **Video files** go through the same path; the gallery itself only handles images, so videos render via the existing video-URL detection in `MessageContent`.
- **No drag-and-drop** onto the composer yet. Add an `onDrop` handler on the composer container if/when needed; it can call the same `onPickFiles`.
