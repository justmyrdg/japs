-- Change grand_total from INTEGER to DECIMAL(10,2) to support decimal fares
ALTER TABLE trips 
ALTER COLUMN grand_total TYPE DECIMAL(10,2);

-- Verify the change
SELECT column_name, data_type, numeric_precision, numeric_scale 
FROM information_schema.columns 
WHERE table_name = 'trips' AND column_name = 'grand_total';
