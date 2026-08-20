export const sanitizeRecord = (record: {
  properties: Record<string, string | number | boolean>;
}) => ({
  ...record,
  properties: record.properties || {},
});
