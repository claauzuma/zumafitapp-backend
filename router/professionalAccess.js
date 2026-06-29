import express from "express";

import ControladorProfessionalAccess from "../controlador/professionalAccess.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

class RouterProfessionalAccess {
  constructor() {
    this.router = express.Router();
    this.controlador = new ControladorProfessionalAccess();
  }

  start() {
    this.router.post(
      "/professional-applications",
      this.controlador.registerProfessionalApplication
    );

    this.router.get(
      "/admin/professional-applications",
      authMiddleware,
      requireRole("admin"),
      this.controlador.adminListApplications
    );

    this.router.patch(
      "/admin/professional-applications/:id",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      this.controlador.adminPatchApplication
    );

    this.router.get(
      "/coaches/me/subscription",
      authMiddleware,
      requireRole("coach"),
      this.controlador.coachGetSubscription
    );

    this.router.get(
      "/coaches/me/subscription-request",
      authMiddleware,
      requireRole("coach"),
      this.controlador.coachGetSubscription
    );

    this.router.post(
      "/coaches/me/subscription-requests",
      authMiddleware,
      requireRole("coach"),
      denyWriteWhenReadOnlyImpersonation,
      this.controlador.coachCreateSubscriptionRequest
    );

    this.router.get(
      "/admin/coach-subscription-requests",
      authMiddleware,
      requireRole("admin"),
      this.controlador.adminListSubscriptionRequests
    );

    this.router.patch(
      "/admin/coach-subscription-requests/:id/approve",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      this.controlador.adminApproveSubscriptionRequest
    );

    this.router.patch(
      "/admin/coach-subscription-requests/:id/reject",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      this.controlador.adminRejectSubscriptionRequest
    );

    this.router.patch(
      "/admin/coaches/:coachId/subscription",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      this.controlador.adminPatchCoachSubscription
    );

    this.router.get(
      "/admin/access-audit-events",
      authMiddleware,
      requireRole("admin"),
      this.controlador.adminListAuditEvents
    );

    return this.router;
  }
}

export default RouterProfessionalAccess;
