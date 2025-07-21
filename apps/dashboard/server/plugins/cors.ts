import cors from "cors";
import { logger } from "../utils/utils";

export default defineNitroPlugin((plugin) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://devel.fmhy.net",
  ];

  // Add production domain if available
  if (process.env.BETTER_AUTH_URL) {
    try {
      const url = new URL(process.env.BETTER_AUTH_URL);
      allowedOrigins.push(url.origin);
    } catch (e) {
      logger.warn("Invalid BETTER_AUTH_URL:", process.env.BETTER_AUTH_URL);
    }
  }

  plugin.h3App.use(
    fromNodeMiddleware(
      cors({
        origin: allowedOrigins,
        credentials: true,
      }),
    ),
  );
});
