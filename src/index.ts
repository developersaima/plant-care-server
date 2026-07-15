// server/src/index.ts
import dns from "node:dns";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import dotenv from "dotenv";
import { type UserPayload, type Plant } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      user: UserPayload;
    }
  }
}

dns.setServers(["8.8.8.8", "8.8.4.4"]);
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI as string;
const port = process.env.PORT || 5000;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

const authServerUrl = process.env.PUBLIC_URL || "http://localhost:3000";
const jwksUrl = `${authServerUrl}/api/auth/jwks`;
console.log(`Using JWKS endpoint: ${jwksUrl}`);

const JWKS = createRemoteJWKSet(new URL(jwksUrl), {
  timeoutDuration: 10000,
  cooldownDuration: 30000,
});

const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    console.log("Verifying token...");
    const { payload } = await jwtVerify(token, JWKS);
    console.log("Token verified successfully for:", payload.email);
    req.user = payload as unknown as UserPayload;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

async function run(): Promise<void> {
  const db = client.db("plant-care");
  const plantsCollection = db.collection<Plant>("plants");

  // POST - Add new plant
  app.post("/api/plants", verifyToken, async (req: Request, res: Response) => {
    try {
      const newPlant: Plant = { 
        ...req.body, 
        email: req.user.email,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await plantsCollection.insertOne(newPlant);
      res.status(201).json({ message: "Plant added successfully", id: result.insertedId });
    } catch (error) {
      console.error("Error adding plant:", error);
      res.status(500).json({ message: "Failed to add plant" });
    }
  });

  // GET all plants with pagination
  app.get("/api/plants", verifyToken, async (req: Request, res: Response) => {
    try {
      const { manage, category, search, page = "1", limit = "10", sort = "-1" } = req.query;
      
      const query: any = {};
      if (manage !== "true") {
        query.email = req.user.email;
      }
      if (category) query.category = category;
      if (search) query.title = { $regex: search as string, $options: "i" };

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      const plants = await plantsCollection
        .find(query)
        .sort({ createdAt: parseInt(sort as string) === 1 ? 1 : -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .toArray();

      const total = await plantsCollection.countDocuments(query);
      res.json({ plants, total, pages: Math.ceil(total / limitNum) });
    } catch (error) {
      console.error("Error fetching plants:", error);
      res.status(500).json({ message: "Failed to fetch plants" });
    }
  });

  // GET single plant by ID
  app.get("/api/plants/:id", verifyToken, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      console.log("Fetching plant with ID:", id);
      
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      const plant = await plantsCollection.findOne({ _id: new ObjectId(id) });
      
      console.log("Plant found:", plant ? "Yes" : "No");
      
      if (!plant) {
        return res.status(404).json({ message: "Plant not found" });
      }
      
      if (plant.email !== req.user.email) {
        return res.status(403).json({ message: "Unauthorized access" });
      }
      
      res.json(plant);
    } catch (error) {
      console.error("Error fetching plant:", error);
      res.status(500).json({ message: "Failed to fetch plant" });
    }
  });

  // PATCH - Update plant
  app.patch("/api/plants/:id", verifyToken, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (typeof id !== 'string' || !ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const plant = await plantsCollection.findOne({ _id: new ObjectId(id) });
      if (!plant) {
        return res.status(404).json({ message: "Plant not found" });
      }
      if (plant.email !== req.user.email) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const result = await plantsCollection.updateOne(
        { _id: new ObjectId(id) }, 
        { $set: { ...req.body, updatedAt: new Date() } }
      );
      res.json({ message: "Plant updated successfully", result });
    } catch (error) {
      console.error("Error updating plant:", error);
      res.status(500).json({ message: "Failed to update plant" });
    }
  });

  // DELETE - Remove plant
  app.delete("/api/plants/:id", verifyToken, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (typeof id !== 'string' || !ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const plant = await plantsCollection.findOne({ _id: new ObjectId(id) });
      if (!plant) {
        return res.status(404).json({ message: "Plant not found" });
      }
      if (plant.email !== req.user.email) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const result = await plantsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ message: "Plant deleted successfully", result });
    } catch (error) {
      console.error("Error deleting plant:", error);
      res.status(500).json({ message: "Failed to delete plant" });
    }
  });

  // GET dashboard stats
  app.get("/api/dashboard/stats", verifyToken, async (req: Request, res: Response) => {
    try {
      const stats = await plantsCollection.aggregate([
        { $match: { email: req.user.email } },
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ]).toArray();
      
      const totalPlants = await plantsCollection.countDocuments({ email: req.user.email });
      res.json({ totalPlants, stats });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // await client.connect();
  // console.log("✅ Database connected");
  // console.log(`✅ Server running on port ${port}`);
}

run().catch(console.dir);

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

export default app;