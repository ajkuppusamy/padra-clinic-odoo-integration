import { Logger } from '@nestjs/common';

const logger = new Logger('SaleServiceTypeConfig');

type Stage = 'dev' | 'prod';

const configs: Record<Stage, Record<string, string>> = {
  dev: {
    SALE_SERVICE_TYPE_MAP: JSON.stringify({
      'Hair Transplant': 3,
      Beauty: 4,
      PRP: 5,
      'Hair Transplant - Revisit': 3, // Using same service type for revisit as original procedure for easier reporting in HubSpot, can be changed if needed
      Products: 7,
    }),
    ODOO_ANALYTIC_PLAN_ID: '3',
  },

  prod: {
    SALE_SERVICE_TYPE_MAP: JSON.stringify({
      'Hair Transplant': 1,
      Beauty: 4,
      PRP: 2,
      'Hair Transplant - Revisit': 1, // Using same service type for revisit as original procedure for easier reporting in HubSpot, can be changed if needed
      Products: 4,
    }),
    ODOO_ANALYTIC_PLAN_ID: '1',
  },
};

export const loadSaleServiceTypeConfig = (stage: string) => {
  const selectedConfig = configs?.[stage as Stage];

  if (selectedConfig && Object.keys(selectedConfig).length > 0) {
    for (const [key, value] of Object.entries(selectedConfig)) {
      process.env[key] = value;
    }

    logger.log(`Sale service type config loaded for ${stage}`);
  } else {
    logger.error(`No config found for stage: ${stage}`);
  }
};

export const getSaleServiceTypeValue = (internalName: string): number | null => {
  try {
    const saleServiceTypeMap = JSON.parse(process.env.SALE_SERVICE_TYPE_MAP || '{}');

    return saleServiceTypeMap?.[internalName] || null;
  } catch (error) {
    logger.error('Error parsing SALE_SERVICE_TYPE_MAP', error);
    return null;
  }
};
