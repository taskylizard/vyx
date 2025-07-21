import { logger } from "../utils/utils";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    event.context.logger = logger;
    logger.start(`${event.method} ${event.path}`);
  });

  nitroApp.hooks.hook("error", (event, { body }) => {
    logger.error(event.message, event.message, body);
  });

  nitroApp.hooks.hook("afterResponse", (event) => {
    logger.success(`${event.method} ${event.path}`);
  });
});