import express from "express";
import cors from "cors";

/**
 * Setup Express middleware
 */
export function setupMiddleware(app: express.Application): void {
  app.use(cors());
  app.use(express.json());
  app.use(express.static("public"));
}
