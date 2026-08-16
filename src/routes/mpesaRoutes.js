const express = require("express")
const router = express.Router()
const mpesaController = require("../../controllers/mpesaController")
const { protectRoute, requireRole } = require("../../middlewares/authMiddleware")

router.post(
    "/stkpush",
    protectRoute,
    requireRole(["superAdmin", "manager", "cashier"]),
    mpesaController.stkPush
)

router.post("/callback/:businessId/:storeId", mpesaController.stkCallback)

router.post("/c2b-validation/:businessId", mpesaController.c2bValidation)

router.post("/c2b-confirmation/:businessId", mpesaController.c2bConfirmation)

router.post(
    "/c2b/register",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.c2bRegisterURL
)

router.post(
    "/config",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.createConfig
)

router.get(
    "/config",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.getConfigs
)

router.get(
    "/config/:id",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.getConfig
)

router.put(
    "/config/:id",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.updateConfig
)

router.delete(
    "/config/:id",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.deleteConfig
)

router.get(
    "/logs",
    protectRoute,
    requireRole(["superAdmin", "manager"]),
    mpesaController.getTransactionLogs
)

module.exports = router