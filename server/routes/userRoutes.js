const express = require("express");
const router = express.Router();
const {
	getUsers,
	createUser,
	updateUser,
	deleteUser,
} = require("../controllers/userController");
const { authenticate, authorize } = require("../middleware/auth");

router.use(authenticate, authorize("owner"));

router.get("/", getUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
