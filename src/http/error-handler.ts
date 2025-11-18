import { DataValidationError, EntityConflictError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "./responses";

const jsonError = (status: number, message: string): Response => {
  return jsonResponse(
    { error: message },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
};

const mapErrorToResponse = (error: unknown): Response | null => {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof DataValidationError) {
    return jsonError(400, error.message);
  }

  if (error instanceof EntityNotFoundError) {
    return jsonError(404, error.message);
  }

  if (error instanceof EntityConflictError) {
    return jsonError(409, error.message);
  }

  if (error instanceof SyntaxError) {
    return jsonError(400, "Invalid JSON payload");
  }

  return null;
};

export const handleRouteError = (error: unknown): Response => {
  const response = mapErrorToResponse(error);
  if (response) {
    return response;
  }

  return jsonError(500, "Internal Server Error");
};
