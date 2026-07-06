const { sequelize, FareSettings } = require("../models");

async function fixFareMultipliers() {
  try {
    await sequelize.authenticate();
    console.log("Database connected");

    // Update all fare settings to have correct multipliers (as percentages)
    const result = await FareSettings.update(
      {
        regular_multiplier: 100,
        student_multiplier: 80,
        senior_citizen_multiplier: 80,
        pwd_multiplier: 80,
        discounted_multiplier: 80,
      },
      {
        where: {},
      },
    );

    console.log(`Updated ${result[0]} fare settings records`);
    console.log(
      "Multipliers are now set as percentages (100 = full fare, 80 = 20% discount)",
    );

    // Show updated records
    const settings = await FareSettings.findAll();
    console.log("\nCurrent fare settings:");
    settings.forEach((s) => {
      console.log({
        id: s.id,
        minimum_fare: s.minimum_fare,
        base_distance_km: s.base_distance_km,
        rate_per_km: s.rate_per_km,
        regular_multiplier: s.regular_multiplier,
        student_multiplier: s.student_multiplier,
        senior_citizen_multiplier: s.senior_citizen_multiplier,
        pwd_multiplier: s.pwd_multiplier,
        discounted_multiplier: s.discounted_multiplier,
      });
    });

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixFareMultipliers();
