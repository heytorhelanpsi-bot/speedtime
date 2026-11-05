import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { createApp } from './app.js';

createApp().listen(config.PORT, () => logger.info({ port: config.PORT }, 'API ouvindo'));
