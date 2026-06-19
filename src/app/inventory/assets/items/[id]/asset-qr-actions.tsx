"use client";

type AssetQrActionsProps = {
  qrUrl: string;
  assetUrl: string;
  assetTitle: string;
  assetCode: string | null;
  assetId?: string | null;
  serialNumber?: string | null;
  brand?: string | null;
  model?: string | null;
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

function safeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortAssetFallback(assetId: string | null | undefined, assetTitle: string) {
  const cleanId = safeText(assetId).replace(/-/g, "");
  if (cleanId) return cleanId.slice(0, 10).toUpperCase();
  return safeText(assetTitle).slice(0, 18).toUpperCase() || "ACTIVO";
}

function buildAssetPrintQueueUrl(opts: {
  assetCode: string | null;
  assetId?: string | null;
  assetTitle: string;
  assetUrl: string;
  serialNumber?: string | null;
}) {
  const code = safeText(opts.assetCode) || shortAssetFallback(opts.assetId, opts.assetTitle);
  const title = safeText(opts.assetTitle) || "Activo fisico";
  const serial = safeText(opts.serialNumber);
  const queue = [code, title, safeText(opts.assetUrl), serial].join("|");
  const params = new URLSearchParams({
    preset: "ASSET_50x30_QR",
    title: "EQUIPO",
    queue,
    append: "1",
  });
  return `/printing/jobs?${params.toString()}`;
}

export function AssetQrActions({
  qrUrl,
  assetUrl,
  assetTitle,
  assetCode,
  assetId,
  serialNumber,
  brand,
  model,
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

  const printLabel = () => {
    const printWindow = window.open("", "_blank", "width=420,height=260");
    if (!printWindow) return;

    const labelCode = safeText(assetCode) || shortAssetFallback(assetId, assetTitle);
    const labelTitle = safeText(assetTitle) || "Activo fisico";
    const serial = safeText(serialNumber);
    const detail = [safeText(brand), safeText(model)].filter(Boolean).join(" ");

    const serialMarkup = serial ? `<div class="serial">SER: ${escapeHtml(serial)}</div>` : "";
    const detailMarkup = detail ? `<div class="detail">${escapeHtml(detail)}</div>` : "";

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Etiqueta ${escapeHtml(labelCode)}</title>
          <style>
            @page {
              size: 50mm 30mm;
              margin: 0;
            }
            * {
              box-sizing: border-box;
            }
            html,
            body {
              width: 50mm;
              height: 30mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
              color: #000;
              background: #fff;
              font-family: Arial, Helvetica, sans-serif;
            }
            .label {
              width: 50mm;
              height: 30mm;
              display: grid;
              grid-template-columns: 21.5mm 1fr;
              gap: 2mm;
              align-items: center;
              padding: 3mm;
              overflow: hidden;
            }
            img {
              width: 21mm;
              height: 21mm;
              display: block;
            }
            .text {
              min-width: 0;
              overflow: hidden;
              line-height: 1.08;
            }
            .header {
              font-size: 6.5pt;
              font-weight: 800;
              letter-spacing: 0;
            }
            .code {
              margin-top: 1mm;
              font-size: 9pt;
              font-weight: 800;
              overflow-wrap: anywhere;
            }
            .title {
              margin-top: 1mm;
              font-size: 7pt;
              font-weight: 700;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .detail,
            .serial {
              margin-top: 0.8mm;
              font-size: 6pt;
              font-weight: 700;
              overflow: hidden;
              white-space: nowrap;
              text-overflow: ellipsis;
            }
          </style>
        </head>
        <body>
          <div class="label">
            <img src="${escapeHtml(qrUrl)}" alt="QR" />
            <div class="text">
              <div class="header">EQUIPO</div>
              <div class="code">${escapeHtml(labelCode)}</div>
              <div class="title">${escapeHtml(labelTitle)}</div>
              ${detailMarkup}
              ${serialMarkup}
            </div>
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

  const assetPrintQueueUrl = buildAssetPrintQueueUrl({
    assetCode,
    assetId,
    assetTitle,
    assetUrl,
    serialNumber,
  });

  return (
    <div className="mt-4 grid gap-2">
      <a href={assetPrintQueueUrl} className="ui-btn ui-btn--brand ui-btn--sm w-full">
        Enviar a cola Zebra
      </a>
      <button type="button" onClick={printLabel} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
        Imprimir en navegador
      </button>
      <button type="button" onClick={printQr} className="ui-btn ui-btn--brand ui-btn--sm w-full">
        Imprimir QR
      </button>
      <button type="button" onClick={downloadQr} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
        Descargar QR
      </button>
    </div>
  );
}
