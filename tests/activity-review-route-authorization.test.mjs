import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server.js";
import { loadRoute } from "./helpers/load-route.mjs";
import { canReviewActivityStudent } from "../src/lib/activity-submission-service.ts";

const schoolId = new ObjectId();
const companyId = new ObjectId();
const actorId = new ObjectId();
const studentId = new ObjectId();
const activityId = new ObjectId();

function routeFixture(role, { legacyCompany = false, allowed = true } = {}) {
  const auth = { role, userId: actorId, schoolId, companyId: legacyCompany ? null : companyId, user: { _id: actorId, role, schoolId, companyId: legacyCompany ? null : companyId, active: true } };
  const decisions = [];
  const db = { collection(name) {
    if (name === "schools") return { findOne: async () => ({ _id: schoolId, companyId, active: true }) };
    if (name === "activityRecords") return { findOne: async () => ({ _id: activityId, schoolId: String(schoolId), companyId: String(companyId), studentId: String(studentId) }) };
    throw new Error(`unexpected collection ${name}`);
  } };
  class AuthorizationError extends Error {}
  class NotFoundError extends Error {}
  const route = loadRoute("src/app/api/activity-submissions/[id]/review/route.ts", {
    "@/lib/mongodb": { __esModule: true, default: Promise.resolve({ db: () => db }) },
    "@/lib/auth": { authenticateRequest: async () => ({ authenticated: true, auth }) },
    "@/lib/activity-persistence-types": { ACTIVITY_COLLECTIONS: { records: "activityRecords" } },
    "@/lib/activity-approval-service": {
      ActivityApprovalAuthorizationError: AuthorizationError,
      ActivityApprovalNotFoundError: NotFoundError,
      processActivityApproval: async (_client, _db, input) => {
        decisions.push(input);
        return { state: "applied", duplicate: false, activityId, approvedQuantity: input.approvedQuantity, targetQuantity: 10, maximumPoints: 100, calculatedPoints: 50, pointsDifference: input.decision === "rejected" ? 0 : 50, resultingBalance: 50, activityRevision: 1, ledgerRevision: 1, adjustmentPendencyId: null };
      },
    },
    "@/lib/activity-submission-service": { activitySubmissionsEnabled: () => true, canReviewActivityStudent: async () => allowed },
    "@/lib/activity-submission-route": {
      activitySubmissionsDisabledResponse: () => NextResponse.json({}, { status: 404 }),
      resolveActivitySchool: current => current.schoolId,
      activityRouteError: error => NextResponse.json({ error: error.message }, { status: error instanceof AuthorizationError ? 403 : error instanceof NotFoundError ? 404 : 500 }),
    },
    "@/lib/school-scoring-mode": { activityApprovalsEnabled: () => true, automaticActivityScoringEnabled: () => true },
    "@/lib/subscription-access": { getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: true }) },
  });
  const request = decision => ({ headers: new Headers({ "idempotency-key": `review-${decision}-0001` }), json: async () => ({ decision, approvedQuantity: 5, expectedActivityRevision: 0, justification: decision === "approved" ? "" : "Revisão necessária" }) });
  const context = { params: Promise.resolve({ id: String(activityId) }) };
  return { route, request, context, decisions };
}

for (const role of ["admin", "educator"]) for (const decision of ["approved", "corrected", "rejected"]) {
  test(`${role} autorizado executa ${decision} mesmo com identidade legada sem companyId`, async () => {
    const fixture = routeFixture(role, { legacyCompany: true });
    const response = await fixture.route.POST(fixture.request(decision), fixture.context);
    assert.equal(response.status, 200, await response.text());
    assert.equal(fixture.decisions[0].decision, decision);
    if (role === "educator") assert.deepEqual(fixture.decisions[0].authorizedStudentIds, [studentId]);
  });
}

test("educador sem vínculo com o aluno continua bloqueado", async () => {
  const fixture = routeFixture("educator", { allowed: false });
  assert.equal((await fixture.route.POST(fixture.request("approved"), fixture.context)).status, 403);
  assert.equal(fixture.decisions.length, 0);
});

test("helper aceita vínculos string/ObjectId e bloqueia outra turma", async () => {
  const calls = [];
  const db = { collection: () => ({ findOne: async filter => { calls.push(filter); return { _id: new ObjectId() }; } }) };
  assert.equal(await canReviewActivityStudent(db, { actorId, actorRole: "educator", schoolId, studentId }), true);
  assert.deepEqual(calls[0].schoolId.$in, [schoolId, String(schoolId)]);
  assert.deepEqual(calls[0].educatorId.$in, [actorId, String(actorId)]);
  assert.deepEqual(calls[0].studentIds.$in, [studentId, String(studentId)]);
  const denied = { collection: () => ({ findOne: async () => null }) };
  assert.equal(await canReviewActivityStudent(denied, { actorId, actorRole: "educator", schoolId, studentId }), false);
  assert.equal(await canReviewActivityStudent(denied, { actorId, actorRole: "admin", schoolId, studentId }), true);
});
