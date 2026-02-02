"use client";

type Option = {
  id: string;
  name: string;
};

type Props = {
  name: string;
  activeSiteId: string;
  value: string;
  options: Option[];
  placeholder?: string;
};

export function RemissionsDestinationSelect({
  name,
  activeSiteId,
  value,
  options,
  placeholder,
}: Props) {
  const hasOptions = options.length > 0;
  const placeholderLabel = placeholder ?? "Selecciona una sede";

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    const url = new URL(window.location.href);

    if (activeSiteId) {
      url.searchParams.set("site_id", activeSiteId);
    } else {
      url.searchParams.delete("site_id");
    }

    if (next) {
      url.searchParams.set("from_site_id", next);
    } else {
      url.searchParams.delete("from_site_id");
    }

    window.location.href = url.toString();
  }

  return (
    <select
      name={name}
      defaultValue={value || ""}
      onChange={handleChange}
      className="ui-input"
      disabled={!hasOptions}
    >
      <option value="" disabled>
        {hasOptions ? placeholderLabel : `${placeholderLabel} (sin opciones)`}
      </option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
