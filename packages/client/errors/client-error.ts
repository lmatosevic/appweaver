export class ClientError extends Error {
  constructor(
    text: string,
    public errorCode: number,
    public response?: Response
  ) {
    super(text);
  }
}
