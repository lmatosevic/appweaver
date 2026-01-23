import { Environment } from '../enums';
import { errorMessage } from '../utils';
import { config } from '../config';

export class HttpError extends Error {
  constructor(
    text: string,
    public statusCode: number = 400,
    public error?: unknown,
    public errorCode?: number
  ) {
    super(
      config.APP_ENV !== Environment.Production && error
        ? ` ${text} (${errorMessage(error)})`
        : text
    );
  }
}
