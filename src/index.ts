import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;

import App from "@/app/App";
import { logger } from "@/utils/logger";

import "@extensions/array.extensions";
import AppQueueFactory from "queue/queue/AppQueueFactory";

logger.info("Starting bot...");
setupExitHandlers();

async function main() {
  const maxRetries = 3;
  let retries = 0;

  const startWithRetry = async () => {
    try {
      const app = new App();
      await app.initalizeApplication();
      logger.info("Application initialized and running");
    } catch (error) {
      logger.error("Error starting application:", error);
      retries++;
      if (retries < maxRetries) {
        const delay = Math.pow(2, retries) * 1000;
        logger.info(`Retrying application start in ${delay}ms (attempt ${retries}/${maxRetries})`);
        setTimeout(startWithRetry, delay);
      } else {
        logger.error("Max retries reached. Application could not be started.");
        process.exit(1);
      }
    }
  };

  await startWithRetry();
}

main();

function setupExitHandlers() {
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception:", err);
    logger.info("Node NOT Exiting...");
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    logger.info("Node NOT Exiting...");
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  try {
    // Close all queues and Redis connection in AppQueueFactory
    await AppQueueFactory.closeAll();

    // If you have a shutdown method in your App class, you can call it here
    // await app.shutdown();

    logger.info('Graceful shutdown completed.');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}