import { describe, expect, it } from "vitest";
import { detectVideoType, parseByteRange } from "./storage";

const ascii = (value: string) => Uint8Array.from(Buffer.from(value, "latin1"));

describe("video type detection", () => {
  it("recognises MP4 and WebM signatures and rejects everything else", () => {
    expect(detectVideoType(ascii("\0\0\0\x20ftypisom"))).toBe("video/mp4");
    expect(detectVideoType(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe("video/webm");
    expect(detectVideoType(ascii("\0\0\0\x14ftypqt  "))).toBeNull();
    expect(detectVideoType(ascii("not a video!"))).toBeNull();
  });
});

describe("byte ranges", () => {
  it("parses open, closed and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=500-5000", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("ignores malformed ranges and flags ones past the end of the file", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange("bytes=-", 1000)).toBeNull();
    expect(parseByteRange("bytes=2000-", 1000)).toBe("unsatisfiable");
  });
});
