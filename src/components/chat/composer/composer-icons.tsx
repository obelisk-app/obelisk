export type MenuIconKind = "document" | "media" | "camera" | "contact" | "sticker" | "poll" | "event";

export function MenuIcon({ kind }: { kind: MenuIconKind }) {
  const props = {
    className: "h-[18px] w-[18px]",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "document") return <svg {...props}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5M10 13h5M10 17h5" /></svg>;
  if (kind === "media") return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m4 17 5-4 3 2 3-3 5 5" /></svg>;
  if (kind === "camera") return <svg {...props}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></svg>;
  if (kind === "contact") return <svg {...props}><circle cx="12" cy="8" r="3" /><path d="M6 20a6 6 0 0 1 12 0M4 4v16M20 4v16" /></svg>;
  if (kind === "sticker") return <StickerIcon className="h-[18px] w-[18px]" />;
  if (kind === "poll") return <svg {...props}><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></svg>;
  return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>;
}

export function StickerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12a3 3 0 0 1 3 3v8l-7 7H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
      <path d="M14 21v-4a3 3 0 0 1 3-3h4M8 10h.01M16 10h.01M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  );
}
