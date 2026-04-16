import { Logger } from '@nestjs/common';

const logger = new Logger('HubSpotConfig');

type Stage = 'dev' | 'prod';

const configs: Record<Stage, Record<string, string>> = {
  dev: {
    HUBSPOT_DEAL_STAGE_CLOSED_WON: 'dev_closedwon_id',
    HUBSPOT_QUOTATION_STAGE_ID: '2917353456',
  },
  prod: {
    HUBSPOT_DEAL_STAGE_CLOSED_WON: 'prod_closedwon_id',
    HUBSPOT_QUOTATION_STAGE_ID: '',
  },
};

export const loadHubSpotConfig = (stage: string) => {
  const selectedConfig = configs?.[stage];

  if (selectedConfig && Object.keys(selectedConfig).length > 0) {
    for (const [key, value] of Object.entries(selectedConfig)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      }
    }
  } else {
    logger.error(` No config found for stage: ${stage}`);
  }
};
