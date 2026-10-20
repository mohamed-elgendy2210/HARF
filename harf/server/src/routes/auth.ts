import { Router, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {
  authenticate,
  createSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  requireTrustedOrigin,
  sessionCookieMaxAge,
} from "../middleware/auth.js";
import { User } from "../models/User.js";

export const authRouter = Router();

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "not-a-real-account-password",
  12,
);
const allowedRegistrationFields = new Set(["name", "email", "password"]);
const allowedLoginFields = new Set(["email", "password"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowedFields: Set<string>,
): boolean {
  return Object.keys(value).every((field) => allowedFields.has(field));
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return undefined;
  }

  return email;
}

function isValidPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    Buffer.byteLength(value, "utf8") <= 72
  );
}

function safeProfile(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const requireDatabase: RequestHandler = (_request, response, next) => {
  if (mongoose.connection.readyState !== 1) {
    response.status(503).json({ error: "Database is not available." });
    return;
  }

  next();
};

authRouter.post(
  "/register",
  requireTrustedOrigin,
  async (request, response, next) => {
    const body: unknown = request.body;
    if (!isRecord(body) || !hasOnlyFields(body, allowedRegistrationFields)) {
      response.status(400).json({ error: "Invalid registration details." });
      return;
    }

    const email = normalizeEmail(body.email);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (
      !email ||
      name.length === 0 ||
      name.length > 100 ||
      !isValidPassword(body.password)
    ) {
      response.status(400).json({ error: "Invalid registration details." });
      return;
    }

    if (mongoose.connection.readyState !== 1) {
      response.status(503).json({ error: "Database is not available." });
      return;
    }

    try {
      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: "parent",
        status: "active",
      });

      response.status(201).json({ user: safeProfile(user) });
    } catch (error) {
      if (isRecord(error) && error.code === 11000) {
        response
          .status(409)
          .json({ error: "An account with this email already exists." });
        return;
      }
      next(error);
    }
  },
);

authRouter.post(
  "/login",
  requireTrustedOrigin,
  requireDatabase,
  async (request, response, next) => {
    const body: unknown = request.body;
    const email = isRecord(body) ? normalizeEmail(body.email) : undefined;
    if (
      !isRecord(body) ||
      !hasOnlyFields(body, allowedLoginFields) ||
      !email ||
      typeof body.password !== "string" ||
      body.password.length === 0 ||
      Buffer.byteLength(body.password, "utf8") > 72
    ) {
      response.status(400).json({ error: "Invalid login details." });
      return;
    }

    try {
      const user = await User.findOne({ email }).select("+passwordHash");
      const passwordMatches = await bcrypt.compare(
        body.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!user || !passwordMatches || user.status !== "active") {
        response.status(401).json({ error: "Invalid email or password." });
        return;
      }

      const token = createSessionToken(user.id);
      response.cookie(getSessionCookieName(), token, {
        ...getSessionCookieOptions(),
        maxAge: sessionCookieMaxAge,
      });
      response.json({ user: safeProfile(user) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get("/me", authenticate, (request, response) => {
  response.json({ user: request.authUser });
});

authRouter.post(
  "/logout",
  requireTrustedOrigin,
  (_request, response) => {
    response.clearCookie(getSessionCookieName(), getSessionCookieOptions());
    response.status(204).end();
  },
);
