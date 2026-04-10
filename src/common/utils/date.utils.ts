export const toHubspotDateValue = (input: any): number => {
  if (!input) return Date.now();

  let timestamp: number;

  // Step 1: Normalize to timestamp
  if (typeof input === 'number') {
    timestamp = input.toString().length === 10 ? input * 1000 : input;
  } else if (input instanceof Date) {
    timestamp = input.getTime();
  } else if (typeof input === 'string') {
    let date = input.trim().replace(/\./g, '-').replace(/\//g, '-');

    let parsed = new Date(date);

    if (isNaN(parsed.getTime())) {
      const parts = date.split('-');

      if (parts.length === 3) {
        let [p1, p2, p3] = parts.map(Number);

        if (p1 > 31) {
          parsed = new Date(`${p1}-${p2}-${p3}`);
        } else if (p1 <= 31 && p2 <= 12) {
          parsed = new Date(`${p3}-${p2}-${p1}`);
        } else {
          parsed = new Date(`${p3}-${p1}-${p2}`);
        }
      }
    }

    timestamp = !isNaN(parsed.getTime()) ? parsed.getTime() : Date.now();
  } else {
    timestamp = Date.now();
  }

  // Step 2: Convert to UTC midnight (IMPORTANT for HubSpot date field)
  const d = new Date(timestamp);

  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
