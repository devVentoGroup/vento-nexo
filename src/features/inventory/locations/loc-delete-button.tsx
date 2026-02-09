"use client";

import { useRef } from "react";

type Props = {
  locId: string;
  locCode: string | null;
  action: (formData: FormData) => Promise<void>;
};

export function LocDeleteButton({ locId, locCode, action }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const msg = locCode
      ? `¿Eliminar el LOC "${locCode}"? Si tiene stock, la operación puede fallar.`
      : "¿Eliminar este LOC? Si tiene stock, la operación puede fallar.";
    if (!confirm(msg)) return;
    const formData = new FormData(formRef.current ?? undefined);
    action(formData);
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="loc_id" value={locId} />
      <button
        type="submit"
        className="ui-btn ui-btn--danger text-sm"
      >
        Eliminar
      </button>
    </form>
  );
}
