import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { authorizeCollaboratorApproval, canManageCollaboratorClass, canParticipateAsCollaborator, collaboratorAudit, deterministicCollaboratorId } from "../src/lib/collaborator-development.ts";

const actorId = new ObjectId();
const base = { actorId, participantId: actorId, participantRole: "admin", isActiveParticipant: true, managesClass: true };

test("only administrative profiles manage collaborator classes", () => {
  assert.equal(canManageCollaboratorClass("admin"), true);
  assert.equal(canManageCollaboratorClass("company_admin"), true);
  assert.equal(canManageCollaboratorClass("super_admin"), true);
  assert.equal(canManageCollaboratorClass("educator"), false);
  assert.equal(canManageCollaboratorClass("student"), false);
});

test("professional profiles participate without becoming students", () => {
  for (const role of ["educator", "admin", "company_admin", "super_admin"]) assert.equal(canParticipateAsCollaborator(role), true);
  assert.equal(canParticipateAsCollaborator("student"), false);
});

for (const role of ["admin", "company_admin", "super_admin"]) {
  test(`${role} may self-approve only with active collaborator participation`, () => {
    assert.deepEqual(authorizeCollaboratorApproval({ ...base, actorRole: role, participantRole: role }), { selfApprovalAdministrative: true });
    assert.throws(() => authorizeCollaboratorApproval({ ...base, actorRole: role, participantRole: role, isActiveParticipant: false }), /PARTICIPATION_REQUIRED/);
  });
}

test("educator self-approval remains forbidden even inside collaborator class", () => {
  assert.throws(() => authorizeCollaboratorApproval({ ...base, actorRole: "educator", participantRole: "educator" }), /SELF_APPROVAL_FORBIDDEN/);
});

test("student cannot participate or obtain self-approval", () => {
  assert.equal(canParticipateAsCollaborator("student"), false);
});

test("a manager can approve another participant while a non-manager cannot", () => {
  const participantId = new ObjectId();
  assert.deepEqual(authorizeCollaboratorApproval({ ...base, actorRole: "admin", participantId }), { selfApprovalAdministrative: false });
  assert.throws(() => authorizeCollaboratorApproval({ ...base, actorRole: "educator", participantRole: "admin", participantId, managesClass: false }), /MANAGER_REQUIRED/);
});

test("administrative self-approval audit carries identity, scope, instant and granted points", () => {
  const activityId = new ObjectId(), schoolId = new ObjectId(), companyId = new ObjectId(), occurredAt = new Date("2026-11-20T12:00:00Z");
  const audit = collaboratorAudit({ activityId, actorId, participantId: actorId, schoolId, companyId, actorRole: "admin", pointsGranted: 25, occurredAt, idempotencyKey: "self-approval-001", selfApprovalAdministrative: true });
  assert.equal(audit.selfApprovalAdministrative, true); assert.equal(audit.actorId, actorId); assert.equal(audit.activityId, activityId); assert.equal(audit.schoolId, schoolId); assert.equal(audit.occurredAt, occurredAt); assert.equal(audit.pointsGranted, 25);
});

test("deterministic ids protect submission, approval and points from duplicate keys", () => {
  assert.equal(String(deterministicCollaboratorId("school", "same-key")), String(deterministicCollaboratorId("school", "same-key")));
  assert.notEqual(String(deterministicCollaboratorId("school-a", "same-key")), String(deterministicCollaboratorId("school-b", "same-key")));
});
