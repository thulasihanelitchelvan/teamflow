import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";

const PORT = Number(process.env.PORT) || 5000;
async function startServer(): Promise<void> {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await connectDatabase();
  app.listen(PORT, () => console.log(`TeamFlow API running at http://localhost:${PORT}`));
}
void startServer().catch((error) => { console.error("Failed to start TeamFlow API:", error); process.exit(1); });
