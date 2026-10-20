import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import mongoose from "mongoose";
import { User, type UserRole } from "../models/User.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const JWT_ISSUER = "harf-api";
const JWT_AUDIENCE = "harf-client";
const COOKIE_MAX_AGE = 60 * 60 * 1000;

export function getJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET?.trim();

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new ApiError(503, "Authentication is not configured.");
  }

  return secret;
}

export function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-harf_session"
    : "harf_session";
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function createSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export const authenticate: RequestHandler = async (request, response, next) => {
  if (mongoose.connection.readyState !== 1) {
    response.status(503).json({ error: "Database is not available." });
    return;
  }

  const token = request.cookies?.[getSessionCookieName()];
  if (typeof token !== "string" || token.length === 0) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const subject =
    typeof decoded === "object" && typeof decoded.sub === "string"
      ? decoded.sub
      : undefined;
  if (!subject || !mongoose.isValidObjectId(subject)) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const user = await User.findById(subject).select("name email role status");
  if (!user || user.status !== "active") {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  request.authUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    if (!roles.includes(request.authUser.role)) {
      response.status(403).json({ error: "Forbidden." });
      return;
    }

    next();
  };
}

export const requireTrustedOrigin: RequestHandler = (
  request,
  response,
  next,
) => {
  const origin = request.get("Origin");
  const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

  if (origin && origin !== allowedOrigin) {
    response.status(403).json({ error: "Request origin is not allowed." });
    return;
  }

  next();
};

export const sessionCookieMaxAge = COOKIE_MAX_AGE;
