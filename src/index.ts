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

const JWKS = createRemoteJWKSet(new URL(`${process.env.PUBLIC_URL}/api/auth/jwks`));

const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).send("Unauthorized");
  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload as unknown as UserPayload;
    next();
  } catch {
    return res.status(403).send("Forbidden");
  }
};

async function run(): Promise<void> {
  const db = client.db("plant-care");
  const plantsCollection = db.collection<Plant>("plants");

  app.post("/api/plants", verifyToken, async (req: Request, res: Response) => {
    const newPlant: Plant = { 
        ...req.body, 
        email: req.user.email,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    res.send(await plantsCollection.insertOne(newPlant));
  });

  app.get("/api/plants", verifyToken, async (req: Request, res: Response) => {
    const { manage, category, search, page = "1", limit = "10", sort = "-1" } = req.query;
    
    const query: { email?: string; category?: any; name?: any } = manage === "true" ? {} : { email: req.user.email };
    if (category) query.category = category;
    if (search) query.name = { $regex: search as string, $options: "i" };

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    const plants = await plantsCollection
      .find(query)
      .sort({ price: parseInt(sort as string) === 1 ? 1 : -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray();

    const total = await plantsCollection.countDocuments(query);
    res.send({ plants, total, pages: Math.ceil(total / limitNum) });
  });

  app.patch("/api/plants/:id", verifyToken, async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') return res.status(400).send("Invalid ID");
    
    const query = { _id: new ObjectId(id) };
    res.send(await plantsCollection.updateOne(query, { $set: { ...req.body, updatedAt: new Date() } }));
  });

  app.delete("/api/plants/:id", verifyToken, async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') return res.status(400).send("Invalid ID");

    res.send(await plantsCollection.deleteOne({ _id: new ObjectId(id) }));
  });

  app.get("/api/dashboard/stats", verifyToken, async (req: Request, res: Response) => {
    const stats = await plantsCollection.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 }, totalPrice: { $sum: "$price" } } }
    ]).toArray();
    res.send({ totalPlants: await plantsCollection.countDocuments(), stats });
  });

  console.log("DB connected");
}

run().catch(console.dir);

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`Server running`));
}

export default app;