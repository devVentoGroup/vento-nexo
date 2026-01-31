"use client";

type VentoEntity =
  | "default"
  | "nexo"
  | "fogo"
  | "pulso"
  | "viso"
  | "origo"
  | "anima"
  | "aura";

const ENTITY_COLORS: Record<VentoEntity, string> = {
  default: "#00D4FF",
  nexo: "#F59E0B",
  fogo: "#fd5315",
  pulso: "#00D4FF",
  viso: "#A855F7",
  origo: "#10B981",
  anima: "#E2006A",
  aura: "#FF7A59",
};

type VentoIconProps = {
  className?: string;
  entity?: VentoEntity;
};

export function VentoIcon({ className, entity = "default" }: VentoIconProps) {
  const iconColor = ENTITY_COLORS[entity];

  return (
    <div className="vento-icon-glow">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className ?? "h-8 w-8"}
      >
        <path
          d="M12 16L32 52L52 16"
          stroke={iconColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="vento-line-glow"
        />
        <line
          x1="12"
          y1="16"
          x2="22"
          y2="34"
          stroke={iconColor}
          strokeWidth="3"
          strokeLinecap="round"
          className="vento-line-glow vento-delay-1"
        />
        <line
          x1="52"
          y1="16"
          x2="42"
          y2="34"
          stroke={iconColor}
          strokeWidth="3"
          strokeLinecap="round"
          className="vento-line-glow vento-delay-2"
        />
        <line
          x1="22"
          y1="34"
          x2="42"
          y2="34"
          stroke={iconColor}
          strokeWidth="3"
          strokeLinecap="round"
          className="vento-line-glow vento-delay-3"
        />
        <circle
          cx="12"
          cy="16"
          r="5"
          fill={iconColor}
          className="vento-node-pulse"
        />
        <circle
          cx="52"
          cy="16"
          r="5"
          fill={iconColor}
          className="vento-node-pulse vento-delay-1"
        />
        <circle
          cx="32"
          cy="52"
          r="5"
          fill={iconColor}
          className="vento-node-pulse vento-delay-2"
        />
        <circle
          cx="22"
          cy="34"
          r="4"
          fill={iconColor}
          className="vento-node-pulse vento-delay-3"
        />
        <circle
          cx="42"
          cy="34"
          r="4"
          fill={iconColor}
          className="vento-node-pulse vento-delay-4"
        />
      </svg>
    </div>
  );
}

type VentoLogoProps = {
  className?: string;
  entity?: VentoEntity;
  showText?: boolean;
};

export function VentoLogo({
  className,
  entity = "default",
  showText = true,
}: VentoLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <VentoIcon entity={entity} className="h-9 w-9" />
      {showText ? (
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight text-[var(--ui-text)]">
            Vento OS
          </span>
          <span className="text-xs text-[var(--ui-muted)]">
            {entity === "nexo" ? "NEXO · Inventario" : entity.toUpperCase()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
