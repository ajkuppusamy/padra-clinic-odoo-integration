import { Logger } from '@nestjs/common';

const logger = new Logger('TreatmentCategoryConfig');

type Stage = 'dev' | 'prod';

const configs: Record<Stage, Record<string, string>> = {
  dev: {
    TREATMENT_CATEGORY_MAP: JSON.stringify({
      'Hair Transplant': 3,
      'Eyebrow Transplant': 4,
      'Beard Transplant': 5,
      Fillers: 6,
      Botox: 7,
      Facial: 8,
      'PRP Face': 9,
      'Meso Face': 10,
      'PRP for Face': 11,
      'PRP for Hair': 12,
      'Mesotherapy for Face': 13,
      'Mesotherapy for Hair': 14,
      'Fotona For Hair': 15,
      'Thread lift': 16,
      Exosome: 17,
      'Dermal fillers': 18,
      Profhilo: 19,
      'Iv drips': 20,
      Potenza: 21,
      'Fotona 4d': 22,
      Picosure: 23,
      Visia: 24,
      'Candela gentlemax pro plus': 25,
      'Candela gentlemax pro': 26,
      'Cynosure elite iq': 27,
      'Tesla former': 28,
      'Cristal pro': 29,
      'Inbody 380': 30,
      'Laser Hair Removal': 31,
      'Iv Drip': 32,
      DSD: 33,
      CEX: 34,
      'Hair Filler': 35,
      Beard: 36,
      'Tattoo Removal': 37,
      'Fotona For Fractional (FACE)': 38,
      'Fotona - Remove The Scar': 39,
      'Fotona - Rejunavation (FACE)': 40,
      'Slimming Treatment': 41,
    }),
  },

  prod: {
    TREATMENT_CATEGORY_MAP: JSON.stringify({
      'Hair Transplant': 103,
      'Eyebrow Transplant': 104,
      'Beard Transplant': 105,
      Fillers: 106,
      Botox: 107,
      Facial: 108,
      'PRP Face': 109,
      'Meso Face': 110,
      'PRP for Face': 111,
      'PRP for Hair': 112,
      'Mesotherapy for Face': 113,
      'Mesotherapy for Hair': 114,
      'Fotona For Hair': 115,
      'Thread lift': 116,
      Exosome: 117,
      'Dermal fillers': 118,
      Profhilo: 119,
      'Iv drips': 120,
      Potenza: 121,
      'Fotona 4d': 122,
      Picosure: 123,
      Visia: 124,
      'Candela gentlemax pro plus': 125,
      'Candela gentlemax pro': 126,
      'Cynosure elite iq': 127,
      'Tesla former': 128,
      'Cristal pro': 129,
      'Inbody 380': 130,
      'Laser Hair Removal': 131,
      'Iv Drip': 132,
      DSD: 133,
      CEX: 134,
      'Hair Filler': 135,
      Beard: 136,
      'Tattoo Removal': 137,
      'Fotona For Fractional (FACE)': 138,
      'Fotona - Remove The Scar': 139,
      'Fotona - Rejunavation (FACE)': 140,
      'Slimming Treatment': 141,
    }),
  },
};

export const loadTreatmentCategoryConfig = (stage: string) => {
  const selectedConfig = configs?.[stage as Stage];

  if (selectedConfig && Object.keys(selectedConfig).length > 0) {
    for (const [key, value] of Object.entries(selectedConfig)) {
      process.env[key] = value;
    }

    logger.log(`Treatment category config loaded for ${stage}`);
  } else {
    logger.error(`No config found for stage: ${stage}`);
  }
};

export const getTreatmentCategoryValue = (internalName: string): number | null => {
  try {
    const treatmentCategoryMap = JSON.parse(process.env.TREATMENT_CATEGORY_MAP || '{}');

    return treatmentCategoryMap?.[internalName] || null;
  } catch (error) {
    logger.error('Error parsing TREATMENT_CATEGORY_MAP', error);
    return null;
  }
};
