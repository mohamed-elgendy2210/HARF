import { model, Schema } from "mongoose";

export const userRoles = ["parent", "specialist", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const accountStatuses = ["active", "disabled"] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export interface UserRecord {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: userRoles, required: true },
    status: {
      type: String,
      enum: accountStatuses,
      required: true,
      default: "active",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, result) {
        const { passwordHash: _passwordHash, __v: _version, ...safeResult } =
          result;
        return safeResult;
      },
    },
  },
);

export const User = model<UserRecord>("User", userSchema);
