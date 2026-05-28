export class HTTPError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "HTTPError";
  }
}

export const BadRequest = (msg: string, details?: unknown) => new HTTPError(400, "bad_request", msg, details);
export const Unauthorized = (msg = "unauthorized") => new HTTPError(401, "unauthorized", msg);
export const Forbidden = (msg = "forbidden") => new HTTPError(403, "forbidden", msg);
export const NotFound = (msg = "not found") => new HTTPError(404, "not_found", msg);
export const Conflict = (msg: string) => new HTTPError(409, "conflict", msg);
export const InternalError = (msg = "internal error") => new HTTPError(500, "internal_error", msg);
