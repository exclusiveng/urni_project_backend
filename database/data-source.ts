import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";

dotenv.config();

// choose paths depending on environment so TypeORM works both in ts-node dev and compiled prod
const isProd = process.env.NODE_ENV === "production";

const useUrl = !!process.env.DATABASE_URL;

export const AppDataSource = new DataSource({
  type: "postgres",
  // If DATABASE_URL is provided, prefer it (useful for Heroku / managed DBs)
  ...(useUrl ? { url: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "urni_schedule",
  }),
  // disable synchronize in production
  synchronize: !isProd,
  logging: !isProd,
  // Entities / migrations depending on environment
  entities: isProd ? ["dist/entities/**/*.js"] : ["src/entities/**/*.ts"],
  migrations: isProd ? ["dist/migrations/**/*.js"] : ["src/migrations/**/*.ts"],
  subscribers: isProd ? ["dist/subscribers/**/*.js"] : ["src/subscribers/**/*.ts"],
  // SSL for production when using a DATABASE_URL (adjust via env var DATABASE_SSL=true)
  ...(useUrl && (process.env.DATABASE_SSL === "true" || isProd) ? {
    ssl: { rejectUnauthorized: false } as any
  } : {}),
});