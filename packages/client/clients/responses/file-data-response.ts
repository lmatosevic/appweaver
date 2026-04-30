/**
 * Response object containing file data and metadata from a file download request.
 * Provides helper methods to consume the stream as text, base64 data URL, or Buffer.
 */
export class FileDataResponse {
  /** Readable stream of the file content. */
  readonly stream: ReadableStream;
  /** Name of the file extracted from the Content-Disposition header or provided default. */
  readonly fileName: string;
  /** MIME type of the file from the Content-Type header. */
  readonly type: string;
  /** Size of the file in bytes from the Content-Length header. */
  readonly length: number;
  /** Range information if the response is a partial content response (HTTP 206). */
  readonly range?: FileContentRange;
  /** Cache duration in seconds from the Cache-Control max-age directive. */
  readonly maxAge?: number;
  /** Expiration timestamp from Expires header. */
  readonly expiresAt?: string;

  private _buffer: ArrayBuffer | undefined;

  constructor(data: {
    stream: ReadableStream;
    fileName: string;
    type: string;
    length: number;
    range?: FileContentRange;
    maxAge?: number;
    expiresAt?: string;
  }) {
    this.stream = data.stream;
    this.fileName = data.fileName;
    this.type = data.type;
    this.length = data.length;
    this.range = data.range;
    this.maxAge = data.maxAge;
    this.expiresAt = data.expiresAt;
  }

  /**
   * Reads and returns the content of the buffer as an ArrayBuffer.
   *
   * @return {Promise<ArrayBuffer>} A promise that resolves to an ArrayBuffer containing the data read from the buffer.
   */
  public async buffer(): Promise<ArrayBuffer> {
    return this._readArrayBuffer();
  }

  /**
   * Reads and returns the content of the buffer as a Blob object.
   *
   * The method reads an ArrayBuffer from an internal data source, then constructs,
   * and returns a Blob object using the buffer's content and a specified MIME type.
   *
   * @return {Promise<Blob>} A promise that resolves to a Blob object containing the read data.
   */
  public async blob(): Promise<Blob> {
    const buf = await this._readArrayBuffer();
    return new Blob([buf], { type: this.type });
  }

  /**
   * Reads and decodes the content of the buffer into a string using the TextDecoder API.
   *
   * @return {Promise<string>} A promise that resolves to the decoded string.
   */
  public async text(): Promise<string> {
    const buf = await this._readArrayBuffer();
    return new TextDecoder().decode(buf);
  }

  /**
   * Reads and converts the buffer into a Base64-encoded data URL string.
   *
   * @return {Promise<string>} A promise that resolves to a Base64-encoded string
   * representing the file, prefixed with the appropriate data MIME type.
   */
  public async base64(): Promise<string> {
    const buf = await this._readArrayBuffer();
    const bytes = new Uint8Array(buf);

    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const encoded = btoa(binary);

    return `data:${this.type};base64,${encoded}`;
  }

  /**
   * Reads and concatenates data chunks from a readable stream into a single ArrayBuffer.
   * If the buffer has already been read, it returns the cached ArrayBuffer.
   *
   * @return {Promise<ArrayBuffer>} A promise that resolves to the ArrayBuffer containing
   * the concatenated data from the stream.
   */
  private async _readArrayBuffer(): Promise<ArrayBuffer> {
    if (this._buffer !== undefined) {
      return this._buffer;
    }

    const reader = this.stream.getReader();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    this._buffer = result.buffer;

    return this._buffer;
  }
}

/**
 * Represents byte range information for partial content responses.
 */
export type FileContentRange = {
  /** Starting byte position of the range (inclusive). */
  start: number;
  /** Ending byte position of the range (inclusive). */
  end: number;
  /** Total size of the complete file in bytes. */
  total: number;
};
