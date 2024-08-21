import appConfig from "@config/index";
import { logger } from "@utils/logger";
import Queue from "bull";
import Redis from 'ioredis';

const { redisHost, redisPort } = appConfig;

const redisClient = new Redis({
  host: process.env.REDIS_HOST || redisHost || 'redis',
  port: parseInt(process.env.REDIS_PORT || (redisPort?.toString()) || '6379', 10),
  maxRetriesPerRequest: 3,  // veya başka bir uygun sayı
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redisClient.on('error', (error) => {
  logger.error(`Redis connection error: ${error}`);
});

redisClient.on('connect', () => {
  logger.info('Successfully connected to Redis');
});

redisClient.on('reconnecting', () => {
  logger.info('Reconnecting to Redis...');
});

class AppQueueFactory {
  private static queues: { [key: string]: Queue.Queue } = {};
  private static instance: AppQueueFactory;

  private constructor() {}

  public static getInstance(): AppQueueFactory {
    if (!AppQueueFactory.instance) {
      AppQueueFactory.instance = new AppQueueFactory();
    }
    return AppQueueFactory.instance;
  }

  public static getQueue(name: string): Queue.Queue {
    if (!this.queues[name]) {
      this.queues[name] = this.createQueue(name);
    }
    return this.queues[name];
  }

  public static createQueue<T>(name: string): Queue.Queue<T> {
    if (!this.queues[name]) {
      try {
        const queue = new Queue(name, {
          createClient: (type) => {
            switch (type) {
              case 'client':
                return redisClient;
              case 'subscriber':
                return redisClient.duplicate();
              case 'bclient':
                return redisClient.duplicate();
              default:
                return redisClient;
            }
          },
          limiter: { max: 5000, duration: 1000 },
        });
        this.onQueueError(queue, name);
        this.onQueueCompleted(queue, name);
        
        // queue.empty() çağrısını kaldırdık

        this.queues[name] = queue;
        logger.info(`Queue ${name} created successfully`);
      } catch (error) {
        logger.error(`Error creating queue ${name}: ${error}`);
        throw error;
      }
    }

    return this.queues[name];
  }

  private static onQueueError(queue: Queue.Queue, name: string) {
    queue.on("error", (error) => {
      logger.error(`Queue ${name} error: ${error}`);
    });
  }

  private static onQueueCompleted(queue: Queue.Queue, name: string) {
    queue.on("completed", (job) => {
      logger.info(`Queue ${name} job completed: ${job.id}`);
    });
  }

  public static async checkRedisConnection() {
    try {
      await redisClient.ping();
      return true;
    } catch (error) {
      logger.error('Redis connection check failed:', error);
      return false;
    }
  }

  public static getAllQueues(): Queue.Queue[] {
    return Object.values(this.queues);
  }

  public static async closeAll() {
    for (const [name, queue] of Object.entries(this.queues)) {
      try {
        await queue.close();
        logger.info(`Queue ${name} closed successfully`);
      } catch (error) {
        logger.error(`Error closing queue ${name}: ${error}`);
      }
    }
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}

export default AppQueueFactory;