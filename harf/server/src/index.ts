import express from "express";
import "dotenv/config";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectToDatabase } from "./database.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) => {
  const databaseReady = mongoose.connection.readyState === 1;

  response.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ok" : "not_ready",
    database: { ready: databaseReady },
  });
});

app.use("/api/auth", authRouter);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`HARF server listening on http://localhost:${port}`);

  void connectToDatabase()
    .then(() => {
      console.log("MongoDB connection established.");
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error && error.message === "MONGODB_URI is not configured."
          ? error.message
          : "MongoDB connection failed. Check the server configuration and database availability.";
      console.error(message);
    });
});
