"use client";

import { createElement, useEffect } from "react";
import type { ComponentProps } from "react";

// The extension is explicit so this wrapper can coexist with the original
// implementation while extensionless imports resolve to this safety layer.
// @ts-expect-error Next.js resolves the TSX source at build time.
import { SearchableSingleSelect as BaseSearchableSingleSelect } from "./SearchableSingleSelect.tsx";

type Props = ComponentProps<typeof BaseSearchableSingleSelect>;

export function SearchableSingleSelect(props: Props) {
  useEffect(() => {
    const preserveMobileSheetInteraction = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest(".ui-mobile-select-sheet__panel")) {
        event.stopPropagation();
      }
    };

    document.addEventListener("mousedown", preserveMobileSheetInteraction, true);
    return () => {
      document.removeEventListener("mousedown", preserveMobileSheetInteraction, true);
    };
  }, []);

  return createElement(BaseSearchableSingleSelect, props);
}
