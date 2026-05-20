import { Logger } from '@nestjs/common';

const logger = new Logger('HubSpotConfig');

type Stage = 'dev' | 'prod';

const configs: Record<Stage, Record<string, string>> = {
  dev: {
    HUBSPOT_DEAL_STAGE_CLOSED_WON: 'dev_closedwon_id',

    HUBSPOT_QUOTATION_STAGE_IDS: '2917353456,3047415744,3047438308,3047370710,3047359436',
    HUBSPOT_PIPELINE_ODOO_COMPANY_MAP: '{"default":8,"1532546015":10,"1536340930":1,"1563799544":10,"1852065785":"17","1862776782":"10","1857130427":"10","1532546016":"10"}',
    HUBSPOT_PORTAL_ID: '342994076',
  },
  prod: {
    HUBSPOT_DEAL_STAGE_CLOSED_WON: 'prod_closedwon_id',
    HUBSPOT_PIPELINE_ODOO_COMPANY_MAP: 'prod1,prod2,prod3',
    HUBSPOT_QUOTATION_STAGE_IDS: 'prod1,prod2,prod3',
    HUBSPOT_PORTAL_ID: '342920228',
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
