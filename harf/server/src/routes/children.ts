import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import { authenticate, requireRole } from "../middleware/auth.js";
import { Child } from "../models/Child.js";

export const childrenRouter = Router();

const allowedFields = new Set(["name", "dateOfBirth"]);
const objectIdPattern = /^[a-f\d]{24}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyAllowedFields(body: Record<string, unknown>): boolean {
  return Object.keys(body).every((field) => allowedFields.has(field));
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const name = value.trim();
  return name.length > 0 && name.length <= 100 ? name : undefined;
}

function shiftUtcDateByMonths(date: Date, monthDelta: number): Date {
  const firstOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthDelta, 1),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth(),
      Math.min(date.getUTCDate(), lastDayOfTargetMonth),
    ),
  );
}

function normalizeDateOfBirth(value: unknown): Date | undefined {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return undefined;
  }

  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const youngestBirthDate = shiftUtcDateByMonths(todayUtc, -18);
  const oldestBirthDateExclusive = shiftUtcDateByMonths(todayUtc, -72);

  if (date > youngestBirthDate || date <= oldestBirthDateExclusive) {
    return undefined;
  }

  return date;
}

function serializeChild(child: {
  id: string;
  name: string;
  dateOfBirth: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: child.id,
    name: child.name,
    dateOfBirth: child.dateOfBirth.toISOString().slice(0, 10),
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
}

function isValidChildId(value: string): boolean {
  return objectIdPattern.test(value) && mongoose.isValidObjectId(value);
}

function getParentId(
  request: Request,
  response: Response,
): string | undefined {
  const parentId = request.authUser?.id;
  if (!parentId) {
    response.status(401).json({ error: "Authentication required." });
    return undefined;
  }
  return parentId;
}

childrenRouter.use(authenticate, requireRole("parent"));

childrenRouter.post("/", async (request, response) => {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  const body: unknown = request.body;
  if (!isRecord(body) || !hasOnlyAllowedFields(body)) {
    response.status(400).json({ error: "Invalid child profile details." });
    return;
  }

  const name = normalizeName(body.name);
  const dateOfBirth = normalizeDateOfBirth(body.dateOfBirth);
  if (!name || !dateOfBirth) {
    response.status(400).json({
      error:
        "A valid name and date of birth are required. The child must be at least 18 months old and younger than 6.",
    });
    return;
  }

  const child = await Child.create({
    name,
    dateOfBirth,
    parentId,
  });

  response.status(201).json({ child: serializeChild(child) });
});

childrenRouter.get("/", async (request, response) => {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  const children = await Child.find({ parentId })
    .sort({ createdAt: -1, _id: -1 })
    .exec();

  response.json({ children: children.map(serializeChild) });
});

childrenRouter.get("/:id", async (request, response) => {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  if (!isValidChildId(request.params.id)) {
    response.status(400).json({ error: "Invalid child ID." });
    return;
  }

  const child = await Child.findOne({
    _id: request.params.id,
    parentId,
  }).exec();

  if (!child) {
    response.status(404).json({ error: "Child profile not found." });
    return;
  }

  response.json({ child: serializeChild(child) });
});

childrenRouter.patch("/:id", async (request, response) => {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  if (!isValidChildId(request.params.id)) {
    response.status(400).json({ error: "Invalid child ID." });
    return;
  }

  const body: unknown = request.body;
  if (
    !isRecord(body) ||
    !hasOnlyAllowedFields(body) ||
    Object.keys(body).length === 0
  ) {
    response.status(400).json({ error: "Invalid child profile details." });
    return;
  }

  const updates: { name?: string; dateOfBirth?: Date } = {};
  if ("name" in body) {
    const name = normalizeName(body.name);
    if (!name) {
      response.status(400).json({ error: "Invalid child profile details." });
      return;
    }
    updates.name = name;
  }

  if ("dateOfBirth" in body) {
    const dateOfBirth = normalizeDateOfBirth(body.dateOfBirth);
    if (!dateOfBirth) {
      response.status(400).json({
        error:
          "Date of birth must be valid. The child must be at least 18 months old and younger than 6.",
      });
      return;
    }
    updates.dateOfBirth = dateOfBirth;
  }

  const child = await Child.findOneAndUpdate(
    { _id: request.params.id, parentId },
    { $set: updates },
    { new: true, runValidators: true },
  ).exec();

  if (!child) {
    response.status(404).json({ error: "Child profile not found." });
    return;
  }

  response.json({ child: serializeChild(child) });
});

childrenRouter.delete("/:id", async (request, response) => {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  if (!isValidChildId(request.params.id)) {
    response.status(400).json({ error: "Invalid child ID." });
    return;
  }

  const child = await Child.findOneAndDelete({
    _id: request.params.id,
    parentId,
  }).exec();

  if (!child) {
    response.status(404).json({ error: "Child profile not found." });
    return;
  }

  response.status(204).end();
});
