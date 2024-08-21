import { TGBot } from "@/bot/tg/TGBot";
import { initWsMessageResultHandlerQueue } from "@/queue/jobs/WsMessageResultHandler";
import {
  initSendNotificationsQueue,
  addSendNotificationsJob,
} from "@/queue/jobs/notification/SendNotifications";
import { initNewWsAllPollDataQueue } from "@/queue/jobs/poll/NewWsAllPollDataJob";
import {
  initPollVoteNotificationQueue,
  addPollVoteNotificationJob,
} from "@/queue/jobs/poll/notification/PollVoteNotificationJob";
import {
  addRpcEndpointHealthcheckerJob,
  initRpcEndpointHealthcheckerQueue,
} from "@/queue/jobs/rpc_endpoint_healthy/RpcEndpointHealthcheckerJob";
import {
  initValAllInfoCheckerQueue,
  addValAllInfoCheckerJob,
} from "@/queue/jobs/validators/ValAllInfoCheckerJob";
import {
  initValsUptimeCheckerQueue,
  addValUptimeCheckerJob,
} from "@/queue/jobs/validators/ValUptimeCheckerJob";
import { AxelarQueryService } from "@/services/rest/AxelarQueryService";
import { AxelarWsClient } from "@/ws/client/AxelarWsClient";
import { connectDb } from "@database/index";
import http from 'http';
import { logger } from '@/utils/logger';
import AppQueueFactory from "@/queue/queue/AppQueueFactory";
import mongoose from 'mongoose';
import { createClient } from 'redis';
import {
  initBroadcasterBalanceCheckerQueue,
  addBroadcasterBalanceCheckerJob,
} from "@/queue/jobs/BroadcasterBalanceCheckerJob";

export default class App {
  axelarQueryService: AxelarQueryService;
  env: string;
  private redisClient: ReturnType<typeof createClient>;

  constructor() {
    this.env = process.env.NODE_ENV ?? "development";

    this.axelarQueryService = new AxelarQueryService();
    this.redisClient = createClient();
    this.redisClient.connect();
  }
  async initalizeApplication() {
    const maxRetries = 3;
    let retries = 0;

    const initializeWithRetry = async () => {
      try {
        await this.initDbConn();
        await this.initAxelarWS();
        await this.initTgBot();
        await this.initJobsAndQueues();
        this.initHealthCheck();
        logger.info("Application initialized successfully");
      } catch (error) {
        logger.error(`Error initializing application: ${error}`);
        retries++;
        if (retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000; // Exponential backoff
          logger.info(`Retrying initialization in ${delay}ms (attempt ${retries}/${maxRetries})`);
          setTimeout(initializeWithRetry, delay);
        } else {
          logger.error("Max retries reached. Application could not be initialized.");
          process.exit(1);
        }
      }
    };

    await initializeWithRetry();
  }
  private async initAxelarWS() {
    new AxelarWsClient();
  }

  private async initDbConn() {
    const maxRetries = 5;
    let retries = 0;

    const connectWithRetry = async () => {
      try {
        await connectDb(this.env);
        logger.info("Successfully connected to the database");
      } catch (error) {
        retries++;
        logger.error(`Failed to connect to the database (attempt ${retries}/${maxRetries}):`, error);
        if (retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000; // Exponential backoff
          setTimeout(connectWithRetry, delay);
        } else {
          logger.error("Max retries reached. Unable to connect to the database.");
          process.exit(1);
        }
      }
    };

    await connectWithRetry();
  }

  private async initTgBot() {
    await TGBot.getInstance();
  }
  private async initJobsAndQueues() {
    // Init queues before jobs
    await this.initQueue();
    // ------------------------------ //
    await this.initJobs();
  }

  private async initQueue() {
    await initValAllInfoCheckerQueue();
    await initValsUptimeCheckerQueue();
    await initPollVoteNotificationQueue();
    await initSendNotificationsQueue();
    await initWsMessageResultHandlerQueue();
    await initNewWsAllPollDataQueue();

    await initRpcEndpointHealthcheckerQueue();
    await initBroadcasterBalanceCheckerQueue();
  }

  private async initJobs() {
    const jobs = [
      { name: 'sendNotifications', job: addSendNotificationsJob },
      { name: 'valAllInfoChecker', job: addValAllInfoCheckerJob },
      { name: 'valUptimeChecker', job: addValUptimeCheckerJob },
      { name: 'pollVoteNotification', job: addPollVoteNotificationJob },
      { name: 'rpcEndpointHealthchecker', job: addRpcEndpointHealthcheckerJob },
      { name: 'broadcasterBalanceChecker', job: addBroadcasterBalanceCheckerJob },
    ];

    for (const { name, job } of jobs) {
      try {
        await job();
        logger.info(`Successfully initialized job: ${name}`);
        this.scheduleJobHealthCheck(name, job);
      } catch (error) {
        logger.error(`Failed to initialize job ${name}:`, error);
        setTimeout(() => this.initSingleJob(name, job), 5000);
      }
    }
  }

  private async initSingleJob(name: string, job: () => Promise<void> | void) {
    try {
      await job();
      logger.info(`Successfully initialized job: ${name}`);
      this.scheduleJobHealthCheck(name, job);
    } catch (error) {
      logger.error(`Failed to initialize job ${name}:`, error);
      setTimeout(() => this.initSingleJob(name, job), 5000);
    }
  }

  private scheduleJobHealthCheck(name: string, job: () => Promise<void> | void) {
    setInterval(async () => {
      try {
        const queue = AppQueueFactory.getQueue(name);
        const jobCounts = await queue.getJobCounts();
        if (jobCounts.active === 0 && jobCounts.waiting === 0) {
          logger.warn(`Job ${name} seems to be inactive. Restarting...`);
          await job();
        }
      } catch (error) {
        logger.error(`Error checking health of job ${name}:`, error);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private initHealthCheck() {
    setInterval(async () => {
      try {
        const redisStatus = await AppQueueFactory.checkRedisConnection();
        const dbStatus = await this.checkDatabaseConnection();
        const queuesStatus = await this.checkQueuesStatus();

        if (!redisStatus || !dbStatus || !queuesStatus) {
          logger.error("Health check failed. Attempting to reinitialize application.");
          await this.initalizeApplication();
        }
      } catch (error) {
        logger.error(`Error during health check: ${error}`);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private async checkDatabaseConnection() {
    try {
      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      logger.error(`Database connection check failed: ${error}`);
      return false;
    }
  }

  private async checkQueuesStatus() {
    try {
      const queues = AppQueueFactory.getAllQueues();
      for (const queue of queues) {
        const jobCounts = await queue.getJobCounts();
        if (jobCounts.active === 0 && jobCounts.waiting === 0) {
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.error(`Queue status check failed: ${error}`);
      return false;
    }
  }
}
