import app from "./app";
import { env } from "./app/config/env";
import { connectDB } from "./app/config/db";

const startServer = async () => {
  try {
    await connectDB();

    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error(error);
  }
};

startServer();