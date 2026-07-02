import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const uri = process.env.MONGO_URI || process.env.STRCNX;
const dbName = process.env.BASE || process.env.DB_NAME || "zumafit";
const apply = process.argv.includes("--apply");

const INDEXES = [
  {
    collection: "access_audit_events",
    keys: { subjectType: 1, subjectId: 1, createdAt: -1 },
    options: { name: "access_audit_subject_createdAt" },
  },
  {
    collection: "access_audit_events",
    keys: { event: 1, createdAt: -1 },
    options: { name: "access_audit_event_createdAt" },
  },
  {
    collection: "access_audit_events",
    keys: { actorType: 1, actorId: 1, createdAt: -1 },
    options: { name: "access_audit_actor_createdAt" },
  },
  {
    collection: "plan_change_requests",
    keys: { userId: 1, status: 1, createdAt: -1 },
    options: { name: "plan_requests_user_status_createdAt" },
  },
  {
    collection: "professional_applications",
    keys: { email: 1, status: 1 },
    options: { name: "professional_applications_email_status" },
  },
  {
    collection: "professional_applications",
    keys: { status: 1, createdAt: -1 },
    options: { name: "professional_applications_status_createdAt" },
  },
  {
    collection: "coach_subscription_requests",
    keys: { coachId: 1, createdAt: -1 },
    options: { name: "coach_subscription_requests_coach_createdAt" },
  },
  {
    collection: "coach_subscription_requests",
    keys: { status: 1, createdAt: -1 },
    options: { name: "coach_subscription_requests_status_createdAt" },
  },
  {
    collection: "invited_users",
    keys: { assignedCoachId: 1, status: 1, createdAt: -1 },
    options: { name: "invited_users_coach_status_createdAt" },
  },
  {
    collection: "invited_users",
    keys: { email: 1, status: 1 },
    options: { name: "invited_users_email_status" },
  },
  {
    collection: "invited_users",
    keys: { clientId: 1, status: 1 },
    options: { name: "invited_users_client_status" },
  },
  {
    collection: "invited_users",
    keys: { source: 1, assignedCoachId: 1, email: 1, status: 1 },
    options: { name: "invited_users_coach_email_status" },
  },
  {
    collection: "invited_users",
    keys: { source: 1, assignedCoachId: 1, clientId: 1, status: 1 },
    options: { name: "invited_users_coach_client_status" },
  },
  {
    collection: "client_coach_blocks",
    keys: { clientId: 1, coachId: 1 },
    options: { name: "client_coach_blocks_client_coach_unique", unique: true },
  },
  {
    collection: "client_coach_blocks",
    keys: { clientId: 1, isActive: 1, blockedAt: -1 },
    options: { name: "client_coach_blocks_client_active_blockedAt" },
  },
  {
    collection: "coach_client_capacity",
    keys: { coachId: 1 },
    options: { name: "coach_client_capacity_coach_unique", unique: true },
  },
  {
    collection: "coach_client_capacity",
    keys: { "reservations.invitationId": 1 },
    options: { name: "coach_client_capacity_reservation_invitation" },
  },
  {
    collection: "coach_client_capacity",
    keys: { "reservations.clientId": 1 },
    options: { name: "coach_client_capacity_reservation_client" },
  },
];

if (!uri) {
  console.error("Falta MONGO_URI o STRCNX en el entorno.");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const report = {
    apply,
    dbName,
    indexes: INDEXES.map((item) => ({
      collection: item.collection,
      keys: item.keys,
      name: item.options.name,
      action: apply ? "ensure" : "dry_run",
    })),
  };

  if (apply) {
    for (const item of INDEXES) {
      await db.collection(item.collection).createIndex(item.keys, item.options);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log("Dry-run solamente. Ejecuta con --apply para crear indices.");
} finally {
  await client.close();
}
