const bcrypt = require("bcrypt");
const { User } = require("../models");

const ALLOWED_ROLES = ["secretary", "audit_teller", "conductor", "driver"];

// GET /api/users
const getUsers = async (req, res) => {
	const users = await User.findAll({
		where: { role: ALLOWED_ROLES },
		attributes: { exclude: ["password"] },
		order: [["last_name", "ASC"]],
	});
	return res.json(users);
};

// POST /api/users
const createUser = async (req, res) => {
	const { password, role, ...rest } = req.body;

	if (!ALLOWED_ROLES.includes(role)) {
		return res.status(400).json({ message: "Invalid role." });
	}

	const hashed = await bcrypt.hash(password, 12);
	const user = await User.create({ ...rest, role, password: hashed });

	const { password: _, ...safe } = user.toJSON();
	return res.status(201).json(safe);
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
	const user = await User.findByPk(req.params.id);

	if (!user) return res.status(404).json({ message: "User not found." });
	if (!ALLOWED_ROLES.includes(user.role)) {
		return res.status(403).json({ message: "Cannot modify this user." });
	}

	const { password, role, ...rest } = req.body;

	if (role && !ALLOWED_ROLES.includes(role)) {
		return res.status(400).json({ message: "Invalid role." });
	}

	const updates = { ...rest };
	if (role) updates.role = role;
	if (password) updates.password = await bcrypt.hash(password, 12);

	await user.update(updates);

	const { password: _, ...safe } = user.toJSON();
	return res.json(safe);
};

// DELETE /api/users/:id
const deleteUser = async (req, res) => {
	const user = await User.findByPk(req.params.id);

	if (!user) return res.status(404).json({ message: "User not found." });
	if (!ALLOWED_ROLES.includes(user.role)) {
		return res.status(403).json({ message: "Cannot delete this user." });
	}

	await user.destroy();
	return res.status(204).send();
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
