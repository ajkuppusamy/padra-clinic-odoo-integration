import { Logger } from '@nestjs/common';

const logger = new Logger('CompanyConfig');

type Stage = 'dev' | 'prod';

const configs: Record<
  Stage,
  {
    DEFAULT_COMPANY_ID: number;
    BRANCH_COMPANY_MAP: Record<string, number>;
  }
> = {
  dev: {
    DEFAULT_COMPANY_ID: 8,

    BRANCH_COMPANY_MAP: {
      dxb: 8,
      qat: 10,
      kuw: 17,
      // ruh: 2, // ruh is not mapped in dev as per current requirement, but can be added here if needed in future
    },
  },
  prod: {
    // map is same for prod and dev, but default company id is different
    DEFAULT_COMPANY_ID: 28,
    BRANCH_COMPANY_MAP: {
      dxb: 110,
      qat: 102,
      kuw: 101,
      // ruh: 102,  // ruh is not mapped in prod as per current requirement, but can be added here if needed in future
    },
  },
};

let currentConfig: (typeof configs)[Stage];

export const loadCompanyConfig = (stage: string) => {
  currentConfig = configs?.[stage as Stage];

  if (currentConfig) {
    logger.log(`Company config loaded for ${stage}`);
  } else {
    logger.error(`No config found for stage: ${stage}`);
  }
};

export const getMappedCompanyId = (companyId: number, branch?: string): number | null => {
  try {
    if (!currentConfig) return companyId;

    /**
     * Only default company id
     * should map based on branch
     */
    if (companyId === currentConfig.DEFAULT_COMPANY_ID) {
      const branchKey = branch?.toLowerCase()?.trim();

      if (!branchKey) {
        logger.warn('Branch not provided for company mapping');
        return null;
      }

      const mappedCompanyId = currentConfig.BRANCH_COMPANY_MAP?.[branchKey];

      if (!mappedCompanyId) {
        logger.warn(`Company mapping not found for branch: ${branch}`);
        return null;
      }

      return mappedCompanyId;
    }

    return companyId;
  } catch (error) {
    logger.error('Error mapping company id', error);
    return null;
  }
};
