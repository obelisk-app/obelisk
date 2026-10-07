/** How many media files a backup could not embed (each still carries its URL and Blossom hash). */
export function failedBackupMedia(backup: { media: ReadonlyArray<{ error?: string }> }): number {
  return backup.media.filter((item) => item.error).length;
}
