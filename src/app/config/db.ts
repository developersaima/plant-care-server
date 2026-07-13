import { MongoClient } from "mongodb";
import { env } from "./env";

export const client = new MongoClient(env.DATABASE_URL);

export const connectDB = async () => {
  await client.connect();
  console.log("MongoDB Connected");
};

export const db = client.db("plantcare-pro");