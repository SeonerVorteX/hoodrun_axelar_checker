// src/queue/jobs/validators/BroadcasterBalanceChecker.ts

import appConfig from '@/config/index';
import { AxelarQueryService } from '@/services/rest/AxelarQueryService';
import { TGBot } from '@/bot/tg/TGBot';
import { logger } from '@/utils/logger';

export const checkBroadcasterBalance = async () => {
    const axelarQueryService = new AxelarQueryService();
    const tgBot = await TGBot.getInstance();

    const BROADCASTER_ADDRESS = appConfig.axelarVoterAddress;
    const THRESHOLD = appConfig.balanceThreshold;

    try {
        const balance = await axelarQueryService.getBroadcasterBalance(BROADCASTER_ADDRESS);
        if (balance < THRESHOLD) {
            const message = `Warning: Broadcaster balance is below the threshold. Current balance: ${balance}`;
            await tgBot.sendNotification({ chatId: 'your-chat-id', text: message });
            logger.info(message);
        }
    } catch (error) {
        logger.error('Error checking broadcaster balance', error);
    }
};
