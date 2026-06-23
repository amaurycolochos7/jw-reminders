declare module "qrcode-terminal" {
  export function generate(text: string, opts?: { small?: boolean }): void;
  export function generate(text: string, opts: { small?: boolean }, cb: (output: string) => void): void;
}
