export const domainErrorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_FAILED",
  "CONFLICT",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function domainErrorResponse(error: unknown, requestId?: string) {
  if (error instanceof DomainError) {
    return Response.json({ error: { code: error.code, message: error.message, requestId: error.requestId ?? requestId } }, { status: error.status });
  }
  return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable.", requestId } }, { status: 503 });
}
