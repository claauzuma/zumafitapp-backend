import { ObjectId } from "mongodb";
import CnxMongoDB from "../model/DBMongo.js";

const targetEmail = String(process.argv[2] || "").trim().toLowerCase();

if (!targetEmail) {
  console.error("Uso: node scripts/auditCoachClientConsistency.mjs <email-cliente>");
  process.exitCode = 1;
} else {
  try {
    await CnxMongoDB.conectar();
    if (!CnxMongoDB.connection) throw new Error("MONGO_CONNECTION_FAILED");

    const users = CnxMongoDB.db.collection("usuarios");
    const invitations = CnxMongoDB.db.collection("invited_users");
    const capacity = CnxMongoDB.db.collection("coach_client_capacity");

    const client = await users.findOne(
      { email: targetEmail },
      {
        projection: {
          email: 1,
          role: 1,
          estado: 1,
          profile: 1,
          coach: 1,
          coachAccess: 1,
          clientPermissions: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      }
    );

    const relatedInvitations = await invitations
      .find(
        {
          $or: [
            { email: targetEmail },
            { inviteeEmail: targetEmail },
            { inviteeEmailNormalized: targetEmail },
          ],
        },
        {
          projection: {
            email: 1,
            inviteeEmail: 1,
            inviteeEmailNormalized: 1,
            status: 1,
            assignedCoachId: 1,
            clientId: 1,
            acceptedUserId: 1,
            acceptedAt: 1,
            activatedAt: 1,
            updatedAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();

    const rawCoachIds = [
      client?.coach?.entrenadorId,
      client?.coachAccess?.coachId,
      ...relatedInvitations.map((invite) => invite.assignedCoachId),
    ].filter(Boolean);
    const coachIds = [...new Set(rawCoachIds.map((id) => String(id)))];

    const results = [];
    for (const coachId of coachIds) {
      const acceptedIds = [coachId];
      if (ObjectId.isValid(coachId)) acceptedIds.push(new ObjectId(coachId));

      const query = {
        role: "cliente",
        "coach.entrenadorId": { $in: acceptedIds },
      };
      const [coach, listedClients, count, capacityRow] = await Promise.all([
        users.findOne(
          { _id: ObjectId.isValid(coachId) ? new ObjectId(coachId) : coachId },
          { projection: { email: 1, role: 1, profile: 1, estado: 1 } }
        ),
        users.find(query, { projection: { email: 1, role: 1, coach: 1, coachAccess: 1 } }).toArray(),
        users.countDocuments(query),
        capacity.findOne({ coachId }),
      ]);

      results.push({ coachId, coach, count, listedClients, capacity: capacityRow });
    }

    console.log(JSON.stringify({ client, invitations: relatedInvitations, coaches: results }, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  } finally {
    await CnxMongoDB.desconectar();
  }
}
