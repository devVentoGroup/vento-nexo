"use client";

type StepHelpProps = {
  meaning: string;
  whenToUse: string;
  example: string;
  impact?: string;
  className?: string;
};

export function StepHelp({
  meaning,
  whenToUse,
  example,
  impact,
  className = "",
}: StepHelpProps) {
  return (
    <div className={`ui-panel-soft space-y-1 p-3 ${className}`.trim()}>
      <div className="ui-caption">
        <strong>Qué significa:</strong> {meaning}
      </div>
      <div className="ui-caption">
        <strong>Cuándo usarlo:</strong> {whenToUse}
      </div>
      <div className="ui-caption">
        <strong>Ejemplo:</strong> {example}
      </div>
      {impact ? (
        <div className="ui-caption">
          <strong>Impacto:</strong> {impact}
        </div>
      ) : null}
    </div>
  );
}
