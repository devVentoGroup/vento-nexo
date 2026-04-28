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
      ? `Eliminar el area "${locCode}"? Si tiene stock, la operacion puede fallar.`
      : "Eliminar esta area? Si tiene stock, la operacion puede fallar.";
    if (!confirm(msg)) return;
    const formData = new FormData(formRef.current ?? undefined);
    action(formData);
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="loc_id" value={locId} />
      <button
        type="submit"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
      >
        Eliminar
      </button>
    </form>
  );
}
