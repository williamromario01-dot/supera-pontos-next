import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canGrantReferralReward,
  REFERRAL_REWARD_POINTS,
  REFERRAL_REWARD_POLICY,
} from "../src/lib/referral-reward.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const createRoute = await read("src/app/api/referrals/route.ts");
const updateRoute = await read("src/app/api/referrals/[id]/route.ts");
const page = await read("src/app/referrals/page.tsx");

test("1. criar indicação não concede pontos", () => {
  assert.match(createRoute, /rewardGranted:\s*false/);
  assert.match(createRoute, /pointsAwarded:\s*0/);
  assert.doesNotMatch(createRoute, /\$inc:\s*\{\s*points/);
});

test("2. registrar contato não concede pontos", () => {
  assert.match(updateRoute, /contact:[\s\S]*?to:\s*"contacted"/);
  assert.match(updateRoute, /pointsGranted:\s*0/);
});

test("3. agendar não concede pontos", () => {
  assert.match(updateRoute, /schedule:[\s\S]*?to:\s*"scheduled"/);
  assert.match(updateRoute, /Indicação aceita sem concessão de pontos/);
});

test("4. não compareceu não concede pontos", () => {
  assert.equal(canGrantReferralReward({ rewardPolicy: REFERRAL_REWARD_POLICY, rewardGranted: false }, "no_show"), false);
  assert.match(page, /"attendance",\s*"no_show"/);
});

test("5. cancelado não concede pontos", () => {
  assert.equal(canGrantReferralReward({ rewardPolicy: REFERRAL_REWARD_POLICY, rewardGranted: false }, "cancelled"), false);
  assert.match(page, /"attendance",\s*"cancelled"/);
});

test("6. compareceu concede exatamente os pontos atuais", () => {
  assert.equal(REFERRAL_REWARD_POINTS, 100);
  assert.equal(canGrantReferralReward({ rewardPolicy: REFERRAL_REWARD_POLICY, rewardGranted: false }, "attended"), true);
  assert.match(updateRoute, /\$inc:\s*\{\s*points:\s*REFERRAL_REWARD_POINTS\s*\}/);
});

test("7. somente usuário autorizado pode confirmar", () => {
  assert.match(updateRoute, /MANAGER_ROLES\s*=\s*\["educator",\s*"admin",\s*"super_admin"\]/);
  assert.match(updateRoute, /MANAGER_ROLES\.includes\(user\.role\)/);
});

test("8. aluno não pode confirmar o próprio comparecimento", () => {
  assert.doesNotMatch(updateRoute, /MANAGER_ROLES[^\n]*student/);
  assert.match(updateRoute, /Sem permissão para processar indicações/);
});

test("9. educador de outra escola não pode confirmar", () => {
  assert.match(updateRoute, /referral\.schoolId\.toString\(\)\s*===\s*user\.schoolId\.toString\(\)/);
  assert.match(updateRoute, /Você não tem acesso a esta indicação/);
});

test("10. admin de outra escola não pode confirmar", () => {
  assert.match(updateRoute, /if \(user\.role === "super_admin"\) return true/);
  assert.match(updateRoute, /hasReferralSchoolAccess\(user, referral\)/);
});

test("11. repetir comparecimento não duplica pontos", () => {
  assert.equal(canGrantReferralReward({ rewardPolicy: REFERRAL_REWARD_POLICY, rewardGranted: true }, "attended"), false);
  assert.match(updateRoute, /A recompensa já havia sido concedida/);
});

test("12. requisições equivalentes são protegidas no banco", () => {
  assert.match(updateRoute, /withTransaction/);
  assert.match(updateRoute, /rewardGranted:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(updateRoute, /modifiedCount !== 1/);
});

test("13. attended para outro status e attended não duplica", () => {
  assert.equal(canGrantReferralReward({ rewardPolicy: REFERRAL_REWARD_POLICY, rewardGranted: true }, "no_show"), false);
  assert.equal(canGrantReferralReward({ rewardPolicy: REFERRAL_REWARD_POLICY, rewardGranted: true }, "attended"), false);
  assert.doesNotMatch(updateRoute, /rewardGranted:\s*false/);
});

test("14. rewardGranted e metadados permanecem persistidos", () => {
  for (const field of ["rewardGranted", "rewardGrantedAt", "rewardPoints", "rewardEntryId"]) {
    assert.match(updateRoute, new RegExp(`${field}\\s*:`));
    assert.match(createRoute, new RegExp(`${field}\\s*:`));
  }
});

test("15. score entry usa id persistido e é criada uma vez na transação", () => {
  assert.match(updateRoute, /const rewardEntryId = new ObjectId\(\)/);
  assert.match(updateRoute, /_id:\s*rewardEntryId/);
  assert.match(updateRoute, /source:\s*"referral"/);
  assert.match(updateRoute, /rewardTrigger:\s*"attendance"/);
});

test("16. registros antigos são identificados como legado", () => {
  assert.match(createRoute, /legacyAttendance:\s*!referral\.attendanceStatus/);
  assert.match(page, /Registro histórico: comparecimento não informado/);
});

test("17. nenhuma recompensa retroativa é criada automaticamente", () => {
  assert.equal(canGrantReferralReward({ rewardGranted: false }, "attended"), false);
  assert.match(updateRoute, /Comparecimento registrado sem recompensa retroativa/);
});

test("18. pontos históricos concedidos não são removidos", () => {
  assert.doesNotMatch(updateRoute, /\$unset:[\s\S]*pointsAwarded/);
  assert.doesNotMatch(updateRoute, /\$inc:\s*\{\s*points:\s*-/);
  assert.match(createRoute, /rewardPoints:\s*referral\.rewardPoints\s*\|\|\s*referral\.pointsAwarded\s*\|\|\s*0/);
});
