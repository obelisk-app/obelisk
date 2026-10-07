import ShootingStars from '@/components/ui/animations/ShootingStars';

/** The room's backdrop: the grid, the shooting stars and the glow. */
export default function StageBackdrop() {
  return (
    <>
      {/* Matrix grid overlay - restored from the legacy VoiceChannel look. */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <ShootingStars contained count={8} />
      </div>
      <div
        className="absolute inset-0 z-0 opacity-60 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(180,249,83,0.05), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(99,102,241,0.10), transparent 70%)',
        }}
      />
    </>
  );
}
