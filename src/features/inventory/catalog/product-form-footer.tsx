type ProductFormFooterProps = {
  submitLabel: string;
  showActiveToggle?: boolean;
  activeDefaultChecked?: boolean;
  activeLabel?: string;
};

export function ProductFormFooter({
  submitLabel,
  showActiveToggle = false,
  activeDefaultChecked = true,
  activeLabel = "Producto activo",
}: ProductFormFooterProps) {
  return (
    <>
      {showActiveToggle ? (
        <section className="ui-panel border-t border-[var(--ui-border)] pt-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_active" defaultChecked={activeDefaultChecked} />
            <span className="ui-label">{activeLabel}</span>
          </label>
        </section>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="ui-btn ui-btn--brand">
          {submitLabel}
        </button>
      </div>
    </>
  );
}
