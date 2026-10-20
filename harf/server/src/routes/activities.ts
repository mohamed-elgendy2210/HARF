import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import {
  activityCatalog,
  activityTypes,
  findAvailableActivity,
} from "../data/activityCatalog.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ActivitySession } from "../models/ActivitySession.js";
import { Child } from "../models/Child.js";

export const activitiesRouter = Router();
export const childActivitySessionsRouter = Router({ mergeParams: true });

const objectIdPattern = /^[a-f\d]{24}$/i;
const activityTypeSet: ReadonlySet<string> = new Set(activityTypes);

interface ChildParams extends Record<string, string> {
  childId: string;
}

interface ChildSessionParams extends Record<string, string> {
  childId: string;
  sessionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(
  body: Record<string, unknown>,
  allowedFields: readonly string[],
): boolean {
  return Object.keys(body).every((field) => allowedFields.includes(field));
}

function isValidObjectId(value: string): boolean {
  return objectIdPattern.test(value) && mongoose.isValidObjectId(value);
}

function getParentId(request: Request, response: Response): string | undefined {
  const parentId = request.authUser?.id;
  if (!parentId) {
    response.status(401).json({ error: "Authentication required." });
    return undefined;
  }
  return parentId;
}

function serializeSession(session: {
  id: string;
  childId: mongoose.Types.ObjectId;
  activityId: string;
  activityType: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    childId: session.childId.toString(),
    activityId: session.activityId,
    activityType: session.activityType,
    status: session.status,
    startedAt: session.startedAt,
    ...(session.completedAt ? { completedAt: session.completedAt } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

activitiesRouter.use(authenticate, requireRole("parent"));
childActivitySessionsRouter.use(authenticate, requireRole("parent"));

activitiesRouter.get("/", (request, response) => {
  const requestedType = request.query.type;
  if (
    requestedType !== undefined &&
    (typeof requestedType !== "string" ||
      !activityTypeSet.has(requestedType))
  ) {
    response.status(400).json({ error: "Invalid activity type." });
    return;
  }

  const availableActivities = activityCatalog.filter(
    (activity) =>
      activity.availability === "available" &&
      (requestedType === undefined || activity.activityType === requestedType),
  );

  response.json({ activities: availableActivities });
});

async function createSession(
  request: Request<ChildParams>,
  response: Response,
): Promise<void> {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  const childId = request.params.childId;
  if (!isValidObjectId(childId)) {
    response.status(400).json({ error: "Invalid child ID." });
    return;
  }

  const body: unknown = request.body;
  if (
    !isRecord(body) ||
    !hasOnlyFields(body, ["activityId"]) ||
    typeof body.activityId !== "string" ||
    body.activityId.trim().length === 0 ||
    body.activityId.trim().length > 100
  ) {
    response.status(400).json({ error: "Invalid activity session details." });
    return;
  }

  const child = await Child.findOne({ _id: childId, parentId })
    .select("_id")
    .exec();
  if (!child) {
    response.status(404).json({ error: "Child profile not found." });
    return;
  }

  const activity = findAvailableActivity(body.activityId.trim());
  if (!activity) {
    response.status(404).json({ error: "Activity not found or unavailable." });
    return;
  }

  const session = await ActivitySession.create({
    parentId,
    childId: child._id,
    activityId: activity.id,
    activityType: activity.activityType,
    status: "in_progress",
  });

  response.status(201).json({ session: serializeSession(session) });
}

async function listSessions(
  request: Request<ChildParams>,
  response: Response,
): Promise<void> {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  const childId = request.params.childId;
  if (!isValidObjectId(childId)) {
    response.status(400).json({ error: "Invalid child ID." });
    return;
  }

  const child = await Child.findOne({ _id: childId, parentId })
    .select("_id")
    .exec();
  if (!child) {
    response.status(404).json({ error: "Child profile not found." });
    return;
  }

  const sessions = await ActivitySession.find({
    parentId,
    childId: child._id,
  })
    .sort({ startedAt: -1, _id: -1 })
    .exec();

  response.json({ sessions: sessions.map(serializeSession) });
}

async function completeSession(
  request: Request<ChildSessionParams>,
  response: Response,
): Promise<void> {
  const parentId = getParentId(request, response);
  if (!parentId) return;

  const childId = request.params.childId;
  const sessionId = request.params.sessionId;
  if (!isValidObjectId(childId)) {
    response.status(400).json({ error: "Invalid child ID." });
    return;
  }
  if (!isValidObjectId(sessionId)) {
    response.status(400).json({ error: "Invalid activity session ID." });
    return;
  }

  const body: unknown = request.body;
  if (
    !isRecord(body) ||
    !hasOnlyFields(body, ["status"]) ||
    body.status !== "completed"
  ) {
    response.status(400).json({ error: "Invalid activity session status." });
    return;
  }

  const child = await Child.findOne({ _id: childId, parentId })
    .select("_id")
    .exec();
  if (!child) {
    response.status(404).json({ error: "Child profile not found." });
    return;
  }

  const session = await ActivitySession.findOneAndUpdate(
    {
      _id: sessionId,
      parentId,
      childId: child._id,
      status: "in_progress",
    },
    { $set: { status: "completed", completedAt: new Date() } },
    { new: true, runValidators: true },
  ).exec();

  if (session) {
    response.json({ session: serializeSession(session) });
    return;
  }

  const existingSession = await ActivitySession.findOne({
    _id: sessionId,
    parentId,
    childId: child._id,
  })
    .select("status")
    .exec();
  if (!existingSession) {
    response.status(404).json({ error: "Activity session not found." });
    return;
  }

  response.status(409).json({ error: "Activity session is not in progress." });
}

childActivitySessionsRouter.post("/", createSession);
childActivitySessionsRouter.get("/", listSessions);
childActivitySessionsRouter.patch("/:sessionId", completeSession);
