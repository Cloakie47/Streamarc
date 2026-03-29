export const FROSTED_PLAY_CLASSES =
  "flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/10 text-white shadow-lg transition-all duration-300 hover:scale-110 hover:bg-white/30 group";

export function FrostedPlaySvg({ className = "ml-1 h-1/2 w-1/2 fill-current drop-shadow-md" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36a1 1 0 00-1.5.86z" />
    </svg>
  );
}

export function FrostedPauseSvg({ className = "h-1/2 w-1/2 fill-current drop-shadow-md" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5.5h3v13H8V5.5zm5 0h3v13h-3V5.5z" />
    </svg>
  );
}

type FrostedPlayMarkProps = {
  sizeClass: string;
  className?: string;
};

/** Decorative frosted play circle (e.g. on cards). Clicks pass through to parent. */
export function FrostedPlayMark({ sizeClass, className = "" }: FrostedPlayMarkProps) {
  return (
    <div className={`${FROSTED_PLAY_CLASSES} ${sizeClass} ${className}`.trim()}>
      <FrostedPlaySvg />
    </div>
  );
}
