declare module 'qrcode-terminal' {
  function generate(text: string, opts?: { small?: boolean }, callback?: (qr: string) => void): void;
  function setErrorLevel(level: string): void;
}
