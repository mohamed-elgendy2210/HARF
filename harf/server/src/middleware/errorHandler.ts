import type { ErrorRequestHandler } from "express";
import { ApiError } from "./auth.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  if (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400
  ) {
    response.status(400).json({ error: "Invalid request body." });
    return;
  }

  console.error("Request failed with an internal server error.");
  response.status(500).json({ error: "Internal server error." });
};
