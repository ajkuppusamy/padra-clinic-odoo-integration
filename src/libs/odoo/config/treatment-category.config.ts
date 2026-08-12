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
      'Hair Transplant': 1,
      'Eyebrow Transplant': 2,
      'Beard Transplant': 3,
      Fillers: 4,
      Botox: 5,
      Facial: 6,
      'PRP Face': 7,
      'Meso Face': 8,
      'PRP for Face': 9,
      'PRP for Hair': 10,
      'Mesotherapy for Face': 11,
      'Mesotherapy for Hair': 12,
      'Fotona For Hair': 13,
      'Thread lift': 14,
      Exosome: 15,
      'Dermal fillers': 16,
      Profhilo: 17,
      'Iv drips': 18,
      Potenza: 19,
      'Fotona 4d': 20,
      Picosure: 21,
      Visia: 22,
      'Candela gentlemax pro plus': 23,
      'Candela gentlemax pro': 24,
      'Cynosure elite iq': 25,
      'Tesla former': 26,
      'Cristal pro': 27,
      'Inbody 380': 28,
      'Laser Hair Removal': 29,
      'Iv Drip': 30,
      DSD: 31,
      CEX: 32,
      'Hair Filler': 33,
      Beard: 34,
      'Tattoo Removal': 35,
      'Fotona For Fractional (FACE)': 36,
      'Fotona - Remove The Scar': 37,
      'Fotona - Rejunavation (FACE)': 38,
      'Slimming Treatment': 39,
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

export const getTreatmentCategoryValue = (internalNames: string): number[] | null => {
  try {
    const treatmentCategoryMap = JSON.parse(process.env.TREATMENT_CATEGORY_MAP || '{}');

    return (
      internalNames
        ?.split(';')
        ?.map((internalName: string) => {
          return treatmentCategoryMap?.[internalName] || null;
        })
        .filter((id: number | null) => id !== null) ?? []
    );
  } catch (error) {
    logger.error('Error parsing TREATMENT_CATEGORY_MAP', error);
    return null;
  }
};
