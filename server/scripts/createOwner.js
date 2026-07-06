require("dotenv").config();
const bcrypt = require("bcrypt");
const { sequelize, User } = require("../models");

const OWNER = {
	employee_id: "EMP-001",
	username: "owner_admin",
	password: "Admin@1234",
	role: "owner",
	first_name: "Juan",
	middle_name: "Santos",
	last_name: "Dela Cruz",
	email: "owner@japs.test",
	contact_number: "09171234567",
};

(async () => {
	try {
		await sequelize.authenticate();
		console.log("Database connected.\n");

		await sequelize.sync({ alter: true });

		const hashed = await bcrypt.hash(OWNER.password, 12);

		const [user, created] = await User.findOrCreate({
			where: { username: OWNER.username },
			defaults: { ...OWNER, password: hashed },
		});

		if (created) {
			console.log("✔  Owner account created successfully.\n");
		} else {
			console.log("⚠  Owner account already exists. No changes made.\n");
		}

		console.log("─────────────────────────────────");
		console.log("  Employee ID :", OWNER.employee_id);
		console.log("  Username    :", OWNER.username);
		console.log("  Password    :", OWNER.password);
		console.log("  Role        :", OWNER.role);
		console.log("  Email       :", OWNER.email);
		console.log("─────────────────────────────────\n");

		await sequelize.close();
		process.exit(0);
	} catch (err) {
		console.error("Error creating owner:", err.message);
		process.exit(1);
	}
})();
