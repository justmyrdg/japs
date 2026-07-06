-- Fix fare multipliers to be percentages (100 = full fare, 80 = 20% discount)
UPDATE fare_settings 
SET 
  regular_multiplier = 100,
  student_multiplier = 80,
  senior_citizen_multiplier = 80,
  pwd_multiplier = 80,
  discounted_multiplier = 80
WHERE regular_multiplier = 0;

-- Show updated values
SELECT 
  id,
  minimum_fare,
  base_distance_km,
  rate_per_km,
  regular_multiplier,
  student_multiplier,
  senior_citizen_multiplier,
  pwd_multiplier,
  discounted_multiplier,
  effective_date
FROM fare_settings;
