require("dotenv").config();
const bcrypt = require("bcrypt");
const { sequelize, User } = require("../models");

const PASSWORD = "Admin@1234";

const USERS = [
  // Secretaries
  {
    employee_id: "EMP-002",
    username: "secretary_01",
    role: "secretary",
    first_name: "Maria",
    last_name: "Reyes",
    email: "secretary1@japs.test",
  },
  {
    employee_id: "EMP-003",
    username: "secretary_02",
    role: "secretary",
    first_name: "Lorna",
    last_name: "Santos",
    email: "secretary2@japs.test",
  },
  // Audit Tellers
  {
    employee_id: "EMP-004",
    username: "teller_01",
    role: "audit_teller",
    first_name: "Carlos",
    last_name: "Garcia",
    email: "teller1@japs.test",
  },
  {
    employee_id: "EMP-005",
    username: "teller_02",
    role: "audit_teller",
    first_name: "Ramon",
    last_name: "Cruz",
    email: "teller2@japs.test",
  },
  // Conductors
  {
    employee_id: "EMP-006",
    username: "conductor_01",
    role: "conductor",
    first_name: "Jose",
    last_name: "Bautista",
    email: "conductor1@japs.test",
  },
  {
    employee_id: "EMP-007",
    username: "conductor_02",
    role: "conductor",
    first_name: "Andres",
    last_name: "Flores",
    email: "conductor2@japs.test",
  },
  {
    employee_id: "EMP-008",
    username: "conductor_03",
    role: "conductor",
    first_name: "Miguel",
    last_name: "Torres",
    email: "conductor3@japs.test",
  },
  {
    employee_id: "EMP-009",
    username: "conductor_04",
    role: "conductor",
    first_name: "Ricardo",
    last_name: "Mendoza",
    email: "conductor4@japs.test",
  },
  // Drivers
  {
    employee_id: "EMP-010",
    username: "driver_01",
    role: "driver",
    first_name: "Eduardo",
    last_name: "Villanueva",
    email: "driver1@japs.test",
  },
  {
    employee_id: "EMP-011",
    username: "driver_02",
    role: "driver",
    first_name: "Roberto",
    last_name: "Lim",
    email: "driver2@japs.test",
  },
  {
    employee_id: "EMP-012",
    username: "driver_03",
    role: "driver",
    first_name: "Antonio",
    last_name: "Ramos",
    email: "driver3@japs.test",
  },
  {
    employee_id: "EMP-013",
    username: "driver_04",
    role: "driver",
    first_name: "Fernando",
    last_name: "Aquino",
    email: "driver4@japs.test",
  },
];

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connected.\n");

    const hashed = await bcrypt.hash(PASSWORD, 12);

    let created = 0,
      skipped = 0;
    for (const u of USERS) {
      const [, wasCreated] = await User.findOrCreate({
        where: { username: u.username },
        defaults: { ...u, password: hashed },
      });
      if (wasCreated) {
        created++;
        console.log(`  ✔  Created  [${u.role.padEnd(12)}] ${u.username}`);
      } else {
        skipped++;
        console.log(
          `  –  Skipped  [${u.role.padEnd(12)}] ${u.username} (already exists)`,
        );
      }
    }

    console.log("\n─────────────────────────────────");
    console.log(`  Created : ${created}`);
    console.log(`  Skipped : ${skipped}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log("─────────────────────────────────\n");

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error("Error seeding users:", err.message);
    process.exit(1);
  }
})();
