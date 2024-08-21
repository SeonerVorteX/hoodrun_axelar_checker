import { AppDb } from "@database/database";
import { NotificationType, INotification as INotificationInterface } from "@database/models/notification/notification.interface";
import { logger } from "@utils/logger";
import { TGBot } from "bot/tg/TGBot";
import { xSeconds } from "queue/jobHelper";
import appJobProducer from "queue/producer/AppJobProducer";
import AppQueueFactory from "queue/queue/AppQueueFactory";

interface INotification extends INotificationInterface {
  retryCount?: number;
  failed?: boolean;
  lastError?: string;
}

const SEND_NOTIFICATIONS_JOB = "sendNotificationsJob";

export const initSendNotificationsQueue = async () => {
  const sendNotificationsQueue = AppQueueFactory.createQueue(SEND_NOTIFICATIONS_JOB);

  sendNotificationsQueue.process(async (job) => {
    const maxRetries = 3;
    let retries = 0;

    const processNotifications = async () => {
      const processWithRetry = async () => {
        try {
          const { notificationRepo } = new AppDb();
          const notSentNotifications = await notificationRepo.findAll({
            sent: false,
            sort: { createdAt: 1 },
          });

          if (!notSentNotifications || notSentNotifications.length === 0) {
            logger.info("No unsent notifications found");
            return;
          }

          const tgBot = await TGBot.getInstance();

          const results = await Promise.allSettled(
            notSentNotifications.map(async (notification: INotification) => {
              try {
                const result = await tgBot.sendNotification(notification);
                if (result.sentSuccess) {
                  await notificationRepo.updateOne(
                    { notification_id: notification.notification_id },
                    { sent: true }
                  );
                }
                return { success: result.sentSuccess, notification_id: notification.notification_id };
              } catch (error) {
                logger.error(`Failed to send notification ${notification.notification_id}:`, error);
                return { success: false, notification_id: notification.notification_id, error };
              }
            })
          );

          const failedNotifications = results.filter(
            (result) => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
          ) as Array<{ reason?: any; value?: { notification_id: string, error: any } }>;

          if (failedNotifications.length > 0) {
            logger.warn(`${failedNotifications.length} notifications could not be sent`);
            await reQueueFailedNotifications(failedNotifications);
          }

          logger.info(`Successfully sent ${results.length - failedNotifications.length} notifications`);
        } catch (error) {
          logger.error("Unexpected error while processing notifications:", error);
          retries++;
          if (retries < maxRetries) {
            const delay = Math.pow(2, retries) * 1000; // Exponential backoff
            logger.info(`Retrying in ${delay}ms (attempt ${retries}/${maxRetries})`);
            setTimeout(processWithRetry, delay);
          } else {
            logger.error("Max retries reached. Notifications could not be processed.");
            throw error;
          }
        }
      };

      await processWithRetry();
    };

    await processNotifications();
  });
};

export const addSendNotificationsJob = async () => {
  try {
    await appJobProducer.addJob(
      SEND_NOTIFICATIONS_JOB,
      {},
      { repeat: { every: xSeconds(10) } }
    );
    logger.info("Send notifications job added successfully");
  } catch (error) {
    logger.error("Failed to add send notifications job:", error);
  }
};

async function reQueueFailedNotifications(failedNotifications: Array<{ reason?: any; value?: { notification_id: string, error: any } }>) {
  const maxRetries = 3;
  for (const failedNotification of failedNotifications) {
    try {
      const notification = await new AppDb().notificationRepo.findOne({ notification_id: failedNotification.value?.notification_id });
      if (notification && ((notification as any).retryCount || 0) < maxRetries) {
        await appJobProducer.addJob(SEND_NOTIFICATIONS_JOB, failedNotification, { priority: 10 });
        await new AppDb().notificationRepo.updateOne(
          { notification_id: failedNotification.value?.notification_id },
          { $inc: { retryCount: 1 } } as any
        );
      } else {
        logger.warn(`Maximum retry count reached for notification ${failedNotification.value?.notification_id}`);
      }
    } catch (error) {
      logger.error(`Error re-queuing failed notification: ${error}`);
    }
  }
}