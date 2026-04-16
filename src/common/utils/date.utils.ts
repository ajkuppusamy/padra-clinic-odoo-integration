export const toHubspotDateValue = (input: any): number => {
  let date: Date;

  // 1. Handle empty
  if (!input) {
    date = new Date();
  }

  // 2. Number (seconds / ms)
  else if (typeof input === 'number') {
    date = new Date(input < 1e12 ? input * 1000 : input);
  }

  // 3. Date object
  else if (input instanceof Date) {
    date = input;
  }

  // 4. String formats
  else if (typeof input === 'string') {
    const value = input.trim();

    // ISO or standard parse
    date = new Date(value);

    // If invalid → try manual parsing (DD-MM-YYYY, DD/MM/YYYY, etc.)
    if (isNaN(date.getTime())) {
      const parts = value.replace(/[./]/g, '-').split('-');

      if (parts.length === 3) {
        let [p1, p2, p3] = parts.map(Number);

        if (p1 > 31) {
          // YYYY-MM-DD
          date = new Date(p1, p2 - 1, p3);
        } else if (p3 > 31) {
          // DD-MM-YYYY
          date = new Date(p3, p2 - 1, p1);
        } else {
          // fallback (MM-DD-YYYY)
          date = new Date(p3, p1 - 1, p2);
        }
      }
    }
  } else {
    date = new Date();
  }

  if (isNaN(date.getTime())) {
    date = new Date();
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
