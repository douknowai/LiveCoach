/**
 * 服务端轻量图片元信息解析（零依赖）
 * 仅解析 JPEG / PNG / WebP 头部获取宽高，用于在透传给多模态模型前做最小尺寸校验。
 * 解析失败（未知格式 / 数据截断）返回 null，由调用方决定放行策略。
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** 上游多模态模型允许的最小像素尺寸（实测报错阈值 14px） */
export const MIN_IMAGE_DIMENSION = 14;

export function getImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 16) return null;
  if (isPng(bytes)) return parsePng(bytes);
  if (isJpeg(bytes)) return parseJpeg(bytes);
  if (isWebp(bytes)) return parseWebp(bytes);
  return null;
}

function isPng(b: Uint8Array): boolean {
  return (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

/** PNG：签名(8B) + IHDR chunk（长度4 + "IHDR"4 + width 大端 u32 @16 + height @20） */
function parsePng(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24) return null;
  const width = readU32BE(b, 16);
  const height = readU32BE(b, 20);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function isJpeg(b: Uint8Array): boolean {
  return b[0] === 0xff && b[1] === 0xd8;
}

/** JPEG：逐 marker 扫描，命中 SOF（0xC0-0xCF，排除 C4/C8/CC）取 height/width */
function parseJpeg(b: Uint8Array): ImageDimensions | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    // 无 payload 的 marker（SOI/EOI/RST/TEM）
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (isSof(marker)) {
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function isWebp(b: Uint8Array): boolean {
  return (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  );
}

/** WebP：VP8X（extended）/ VP8（lossy）/ VP8L（lossless）三种块头的宽高 */
function parseWebp(b: Uint8Array): ImageDimensions | null {
  const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (tag === 'VP8X') {
    if (b.length < 30) return null;
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    if (width > 0 && height > 0) return { width, height };
    return null;
  }
  if (tag === 'VP8 ') {
    // 帧：3B tag + 0x9D 0x01 0x2A + width(14bit LE) + height(14bit LE)，data 偏移 6
    if (b.length < 26) return null;
    const width = (b[26] | (b[27] << 8)) & 0x3fff;
    const height = (b[28] | (b[29] << 8)) & 0x3fff;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }
  if (tag === 'VP8L') {
    // lossless 位流：首字节 0x2F，随后 14bit width-1、14bit height-1（小端位序）
    if (b.length < 25) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (width > 0 && height > 0) return { width, height };
    return null;
  }
  return null;
}

function readU32BE(b: Uint8Array, offset: number): number {
  return (b[offset] << 24) | (b[offset + 1] << 16) | (b[offset + 2] << 8) | b[offset + 3];
}

/** 从 dataUri 解析图片宽高；base64 非法或格式未知时返回 null */
export function decodeDataUriImage(dataUri: string): ImageDimensions | null {
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx < 0) return null;
  const payload = dataUri.slice(commaIdx + 1);
  if (payload.length < 32) return null;
  try {
    const bytes = Buffer.from(payload, 'base64');
    if (bytes.length < 24) return null;
    return getImageDimensions(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    return null;
  }
}
