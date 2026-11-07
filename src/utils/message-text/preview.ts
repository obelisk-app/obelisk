import { parseMentions, type MentionSegment } from './mentions';
import { isImageUrl, extractYouTubeId } from './markdown';
import { isVideoUrl, isAudioUrl, isUploadUrl } from '@/utils/attachments/attachments';

export interface PreviewLabels { image: string; video: string; audio: string; file: string }

/** Shape before truncating: mention tokens must never be cut in half. */
export function messagePreviewSegments(content: string, labels: PreviewLabels, max = 140): MentionSegment[] {
  const labelUrl = (url: string) => isImageUrl(url) ? labels.image
    : isVideoUrl(url) || extractYouTubeId(url) ? labels.video
    : isAudioUrl(url) ? labels.audio
    : isUploadUrl(url) || /\.(?:pdf|txt|md|zip|json|docx?|xlsx?)(?:[?#]|$)/i.test(url) ? labels.file : null;
  const shaped = content
    .replace(/!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_raw, name: string, url: string) => labelUrl(url) ?? (name || labels.file))
    .replace(/https?:\/\/[^\s<>]+/g, (url) => labelUrl(url) ?? url)
    .replace(/\s+/g, ' ').trim();
  const output: MentionSegment[] = [];
  let remaining = max;
  for (const segment of parseMentions(shaped, [])) {
    if (remaining <= 0) break;
    const length = segment.type === 'mention' ? segment.displayName.length + 1 : segment.text.length;
    if (segment.type === 'mention') output.push(segment);
    else output.push({ type: 'text', text: length > remaining ? segment.text.slice(0, Math.max(0, remaining - 1)) + '…' : segment.text });
    remaining -= length;
  }
  return output;
}
