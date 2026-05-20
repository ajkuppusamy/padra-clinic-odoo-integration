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
    // map internal service names to Odoo service type IDs for production
    SALE_SERVICE_TYPE_MAP: JSON.stringify({
      'Hair Transplant': 13,
      Beauty: 14,
      PRP: 15,
      'Hair Transplant - Revisit': 16,
      Products: 17,
    }),
    ODOO_ANALYTIC_PLAN_ID: '13',
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
