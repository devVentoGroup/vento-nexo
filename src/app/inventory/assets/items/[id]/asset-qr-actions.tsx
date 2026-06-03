"use client";

type AssetQrActionsProps = {
  qrUrl: string;
  assetUrl: string;
  assetTitle: string;
  assetCode: string | null;
};

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "activo";
}

export function AssetQrActions({
  qrUrl,
  assetUrl,
  assetTitle,
  assetCode,
}: AssetQrActionsProps) {
  const printQr = () => {
    const printWindow = window.open("", "_blank", "width=520,height=720");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>QR ${assetCode || assetTitle}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 32px;
              text-align: center;
              color: #111827;
            }
            .card {
              border: 1px solid #d1d5db;
              border-radius: 24px;
              padding: 28px;
              display: inline-block;
              max-width: 360px;
            }
            img {
              width: 260px;
              height: 260px;
            }
            h1 {
              font-size: 20px;
              margin: 18px 0 6px;
            }
            .code {
              font-size: 14px;
              font-weight: 700;
              color: #374151;
            }
            .url {
              margin-top: 12px;
              font-size: 10px;
              color: #6b7280;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="${qrUrl}" alt="QR" />
            <h1>${assetTitle}</h1>
            <div class="code">${assetCode || ""}</div>
            <div class="url">${assetUrl}</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const downloadQr = async () => {
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `qr-${safeFileName(assetCode || assetTitle)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(qrUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="mt-4 grid gap-2">
      <button type="button" onClick={printQr} className="ui-btn ui-btn--brand ui-btn--sm w-full">
        Imprimir QR
      </button>
      <button type="button" onClick={downloadQr} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
        Descargar QR
      </button>
    </div>
  );
}
