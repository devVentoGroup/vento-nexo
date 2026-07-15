import { Suspense } from "react";

import { PolicyCreateRedirect } from "./policy-create-redirect";

export default function RemissionsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <PolicyCreateRedirect />
      </Suspense>
      {children}
    </>
  );
}
