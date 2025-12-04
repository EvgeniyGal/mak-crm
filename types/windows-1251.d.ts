declare module 'windows-1251' {
  export function decode(buffer: Uint8Array): string;
  export function encode(text: string): Uint8Array;
}

