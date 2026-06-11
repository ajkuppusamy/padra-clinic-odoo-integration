export const toHubspotDateValue = (input: any): number | null => {
  if (!input) return null;
  let date: Date;

  if (typeof input === 'number') {
    date = new Date(input < 1e12 ? input * 1000 : input);
  } else if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string') {
    const value = input.trim();

    date = new Date(value);

    // Manual parsing for DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
    if (isNaN(date.getTime())) {
      const parts = value.replace(/[./]/g, '-').split('-');

      if (parts.length === 3) {
        const [p1, p2, p3] = parts.map(Number);

        if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
          if (p1 > 31) {
            // YYYY-MM-DD
            date = new Date(p1, p2 - 1, p3);
          } else if (p3 > 31) {
            // DD-MM-YYYY
            date = new Date(p3, p2 - 1, p1);
          } else {
            return null;
          }
        }
      }
    }
  } else {
    return null;
  }

  return isNaN(date.getTime()) ? null : date.getTime();
};
