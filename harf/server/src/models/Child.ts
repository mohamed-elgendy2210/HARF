import { model, Schema, Types } from "mongoose";

export interface ChildRecord {
  name: string;
  dateOfBirth: Date;
  parentId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const childSchema = new Schema<ChildRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    dateOfBirth: { type: Date, required: true },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, result) {
        const { __v: _version, ...safeResult } = result;
        return safeResult;
      },
    },
  },
);

export const Child = model<ChildRecord>("Child", childSchema);
