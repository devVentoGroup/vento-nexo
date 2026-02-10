"use client";

import { useCallback, useEffect, useState } from "react";

export type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  domain: string | null;
};

type CategoryCascadeFilterProps = {
  categories: CategoryRow[];
  categoryL1: string;
  categoryL2: string;
  categoryL3: string;
};

export function CategoryCascadeFilter({
  categories,
  categoryL1,
  categoryL2,
  categoryL3,
}: CategoryCascadeFilterProps) {
  const [selectedL1, setSelectedL1] = useState(categoryL1);
  const [selectedL2, setSelectedL2] = useState(categoryL2);
  const [selectedL3, setSelectedL3] = useState(categoryL3);

  useEffect(() => {
    setSelectedL1(categoryL1);
    setSelectedL2(categoryL2);
    setSelectedL3(categoryL3);
  }, [categoryL1, categoryL2, categoryL3]);

  const handleL1Change = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setSelectedL1(v);
    setSelectedL2("");
    setSelectedL3("");
  }, []);

  const handleL2Change = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setSelectedL2(v);
    setSelectedL3("");
  }, []);

  const handleL3Change = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedL3(e.target.value);
  }, []);

  const roots = categories.filter((c) => c.parent_id === null);
  const level2Options = selectedL1
    ? categories.filter((c) => c.parent_id === selectedL1)
    : [];
  const level3Options =
    selectedL2 && level2Options.some((c) => c.id === selectedL2)
      ? categories.filter((c) => c.parent_id === selectedL2)
      : [];

  const showLevel2 = !!selectedL1;
  const showLevel3 = !!selectedL2 && level3Options.length > 0;

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="ui-label">Categoría (nivel 1)</span>
        <select
          name="category_l1"
          value={selectedL1}
          onChange={handleL1Change}
          className="ui-input"
        >
          <option value="">Todas</option>
          {roots.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>

      {showLevel2 && (
        <label className="flex flex-col gap-1">
          <span className="ui-label">Subcategoría (nivel 2)</span>
          <select
            name="category_l2"
            value={selectedL2}
            onChange={handleL2Change}
            className="ui-input"
          >
            <option value="">—</option>
            {level2Options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {showLevel3 && (
        <label className="flex flex-col gap-1">
          <span className="ui-label">Subcategoría (nivel 3)</span>
          <select
            name="category_l3"
            value={selectedL3}
            onChange={handleL3Change}
            className="ui-input"
          >
            <option value="">—</option>
            {level3Options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      )}

    </>
  );
}
