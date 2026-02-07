declare module "bwip-js" {
  export function toCanvas(
    canvas: HTMLCanvasElement,
    opts: Record<string, unknown>
  ): void;
  const bwipJs: { toCanvas: typeof toCanvas };
  export default bwipJs;
}
