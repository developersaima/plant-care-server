import express from "express";
import cors from "cors";
import { router } from "./app/routes";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", router);

app.get("/", (_, res) => {
  res.json({
    success: true,
    message: "PlantCare Pro API",
  });
});

export default app;