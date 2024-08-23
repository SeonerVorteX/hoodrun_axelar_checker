import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;
import App from "@/app/App";
import { logger } from "@/utils/logger";
import "@extensions/array.extensions";
import AppQueueFactory from "queue/queue/AppQueueFactory";
import { testRedisConnection } from "queue/queue/AppQueueFactory";
import appConfig from "@config/index";

logger.info("Starting bot...");
logger.info(`Redis configuration: host=${appConfig.redisHost}, port=${appConfig.redisPort}`);

setupExitHandlers();

async function main() {
  logger.info("Testing Redis connection...");
  const redisConnected = await testRedisConnection();
  if (!redisConnected) {
    logger.error("Redis connection failed. Exiting application.");
    process.exit(1);
  }
  logger.info("Redis connection successful.");

  const maxRetries = 3;
  let retries = 0;
  const app = new App();

  const startWithRetry = async () => {
    try {
      await app.initalizeApplication();
      logger.info("Application initialized and running");
    } catch (error) {
      logger.error("Error initializing application:", error);
      retries++;
      if (retries < maxRetries) {
        const delay = Math.pow(2, retries) * 1000;
        logger.info(`Retrying initialization in ${delay}ms (attempt ${retries}/${maxRetries})`);
        setTimeout(startWithRetry, delay);
      } else {
        logger.error("Max retries reached. Application could not be initialized.");
        process.exit(1);
      }
    }
  };

  await startWithRetry();
}

function setupExitHandlers() {
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception:", err);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    logger.error("Unhandled Rejection details:", reason);
    logger.error("Unhandled Rejection promise:", promise);
    gracefulShutdown('UNHANDLED_REJECTION');
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

const app = new App();

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  try {
    await AppQueueFactory.closeAll();
    await app.shutdown();
    logger.info('Application shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Unhandled error in main function:", error);
  process.exit(1);
});