import assert from "node:assert/strict";
import test from "node:test";

import ServicioUsuarios from "../servicio/usuarios.js";

function client(overrides = {}) {
  return { _id: "client-1", role: "cliente", email: "nuevo@example.com", personalPlan: "free", ...overrides };
}

function acceptance() {
  return {
    coach: { _id: "coach-1", role: "coach" },
    activeCoachAccess: { status: "active", servicePackage: "service_pro" },
    coachAssignment: { entrenadorId: "coach-1" },
    clientPermissions: {},
  };
}

test("aceptar la invitación vincula al cliente en el mismo paso", async () => {
  const service = new ServicioUsuarios();
  const user = client();
  const invitation = { _id: "invite-1", status: "pending", email: user.email };
  let activationCalls = 0;
  service.getById = async () => user;
  service._getPendingCoachClientInvitationForUser = async () => invitation;
  service._prepareCoachClientInviteAcceptance = async () => acceptance();
  service.clientCoachBlocksModel = { isBlocked: async () => false };
  service._activateAcceptedCoachInvitation = async () => {
    activationCalls += 1;
    return { user: client({ coachAccess: { status: "active" } }), invitation: { ...invitation, status: "active" }, status: "active" };
  };
  service.invitedModel = { findByEmail: async () => [] };

  const result = await service.clientAcceptCoachInvitation({ userId: user._id, invitationId: invitation._id });
  assert.equal(activationCalls, 1);
  assert.equal(result.status, "active");
  assert.equal(result.invitation.status, "active");
});

test("doble aceptación y relación incompatible fallan antes de reservar otro cupo", async () => {
  const service = new ServicioUsuarios();
  service.getById = async () => client();
  service._getPendingCoachClientInvitationForUser = async () => { throw new Error("INVITATION_NOT_FOUND"); };
  await assert.rejects(service.clientAcceptCoachInvitation({ userId: "client-1", invitationId: "invite-1" }), /INVITATION_NOT_FOUND/);

  service._getPendingCoachClientInvitationForUser = async () => ({ _id: "invite-2", status: "pending" });
  service._prepareCoachClientInviteAcceptance = async () => acceptance();
  service.getById = async () => client({ coach: { entrenadorId: "other-coach" }, coachAccess: { status: "active" } });
  await assert.rejects(service.clientAcceptCoachInvitation({ userId: "client-1", invitationId: "invite-2" }), /CLIENT_ALREADY_HAS_ACTIVE_COACH/);
});

test("coach suspendido no puede completar la vinculación", async () => {
  const service = new ServicioUsuarios();
  service.getById = async () => ({ _id: "coach-1", role: "coach", estado: "suspendido" });
  await assert.rejects(
    service._prepareCoachClientInviteAcceptance({ _id: "invite-1", assignedCoachId: "coach-1", source: "coach_invite", targetRole: "cliente" }),
    /COACH_NOT_ACTIVE/
  );
});

test("aceptacion valida aprobacion profesional y alcance solicitado", async () => {
  const invite = {
    _id: "invite-scope",
    assignedCoachId: "coach-1",
    source: "coach_invite",
    targetRole: "cliente",
    servicePackage: "service_pro",
    serviceScopes: ["nutrition"],
  };
  const service = new ServicioUsuarios();
  service._countClientsForCoach = async () => 0;
  service._countPendingClientInvitationsForCoach = async () => 0;
  service._resolveEffectiveCapabilities = async () => ({
    maxClients: 10,
    canReceiveClients: true,
    features: { clients: { canAssign: true } },
  });

  service.getById = async () => ({
    _id: "coach-1",
    role: "coach",
    estado: "activo",
    professionalStatus: "pending_verification",
    professionalScopes: { nutrition: true },
    coachSubscription: { plan: "coach_pro", status: "active", canOffer: ["service_pro"] },
  });
  await assert.rejects(service._prepareCoachClientInviteAcceptance(invite), /PROFESSIONAL_NOT_APPROVED/);

  service.getById = async () => ({
    _id: "coach-1",
    role: "coach",
    estado: "activo",
    professionalStatus: "approved",
    professionalScopes: { training: true, nutrition: false },
    coachSubscription: { plan: "coach_pro", status: "active", canOffer: ["service_pro"] },
  });
  await assert.rejects(service._prepareCoachClientInviteAcceptance(invite), /PROFESSIONAL_SCOPE_REQUIRED/);
});

test("invitación vencida se rechaza como vencida", async () => {
  const service = new ServicioUsuarios();
  const user = client();
  service.invitedModel = {
    getById: async () => ({
      _id: "invite-expired",
      email: user.email,
      status: "pending",
      source: "coach_invite",
      targetRole: "cliente",
      assignedCoachId: "coach-1",
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    }),
  };
  await assert.rejects(service._getPendingCoachClientInvitationForUser(user, "invite-expired"), /INVITATION_EXPIRED/);
});

test("coach puede invitar un email todavia inexistente y el alta queda enlazable", async () => {
  const service = new ServicioUsuarios();
  const coach = {
    _id: "coach-1",
    role: "coach",
    email: "coach@example.com",
    profile: { nombre: "Coach", apellido: "Demo" },
    professionalScopes: { nutrition: true },
  };
  service._assertCoachCanInviteClients = async () => ({
    coach,
    effectiveCapabilities: { planCode: "pro", maxClients: 10 },
    assignedClients: 0,
    pendingInvitations: 0,
    reservedClients: 0,
  });
  service._findUserByEmail = async () => null;
  service._findInviteByEmail = async () => null;
  service.pendingModel = { findByEmail: async () => null };
  service.clientCoachBlocksModel = { isBlocked: async () => false };
  service.invitedModel = {
    findActionableCoachInvitesByTarget: async () => [],
    findRecentRejectedByCoachAndTarget: async () => null,
    countCreatedByCoachSince: async () => 0,
    create: async (payload) => ({ _id: "invite-new", ...payload }),
  };

  const result = await service.coachCreateClientInvitation({
    coachId: "coach-1",
    email: "persona.nueva@example.com",
    profile: { nombre: "Persona", apellido: "Nueva" },
  });
  assert.equal(result.code, "INVITATION_CREATED_EMAIL_ONLY");
  assert.equal(result.invitation.clientId, null);
  assert.match(result.inviteLink, /\/register\?invite=/);
});

test("aceptacion sin cupo falla antes de modificar cliente o invitacion", async () => {
  const service = new ServicioUsuarios();
  const coach = {
    _id: "coach-1",
    role: "coach",
    professionalScopes: { nutrition: true },
    coachSubscription: { plan: "coach_pro", status: "active", canOffer: ["service_pro"] },
  };
  let updates = 0;
  service.clientCoachBlocksModel = { isBlocked: async () => false };
  service._countClientsForCoach = async () => 1;
  service.coachCapacityModel = { reserveSlot: async () => ({ reserved: false, used: 1 }) };
  service.updateById = async () => { updates += 1; };

  await assert.rejects(service._activateAcceptedCoachInvitation({
    client: client(),
    invitation: { _id: "invite-full", assignedCoachId: "coach-1" },
    acceptance: {
      coach,
      activeCoachAccess: { status: "active", servicePackage: "service_pro" },
      coachAssignment: { entrenadorId: "coach-1" },
      clientPermissions: {},
      effectiveCapabilities: { planCode: "pro", maxClients: 1, limits: { maxActiveClients: 1 } },
    },
  }), /COACH_CLIENT_LIMIT_EXCEEDED/);
  assert.equal(updates, 0);
});
