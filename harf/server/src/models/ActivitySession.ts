import { model, Schema, Types } from "mongoose";
import { activityTypes, type ActivityType } from "../data/activityCatalog.js";

export const activitySessionStatuses = [
  "in_progress",
  "completed",
  "abandoned",
] as const;

export type ActivitySessionStatus =
  (typeof activitySessionStatuses)[number];

export interface ActivitySessionRecord {
  parentId: Types.ObjectId;
  childId: Types.ObjectId;
  activityId: string;
  activityType: ActivityType;
  status: ActivitySessionStatus;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const activitySessionSchema = new Schema<ActivitySessionRecord>(
  {
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    childId: {
      type: Schema.Types.ObjectId,
      ref: "Child",
      required: true,
    },
    activityId: { type: String, required: true, trim: true },
    activityType: { type: String, enum: activityTypes, required: true },
    status: {
      type: String,
      enum: activitySessionStatuses,
      required: true,
      default: "in_progress",
    },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, result) {
        const { __v: _version, parentId: _parentId, ...safeResult } = result;
        return safeResult;
      },
    },
  },
);

activitySessionSchema.index({ parentId: 1, childId: 1, startedAt: -1 });

export const ActivitySession = model<ActivitySessionRecord>(
  "ActivitySession",
  activitySessionSchema,
);
