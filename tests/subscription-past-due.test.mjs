import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ObjectId } from "mongodb";

import {
  getOperationalAccessForAuth,
  getSubscriptionAccessState,
  PAST_DUE_GRACE_PERIOD_MS,
} from "../src/lib/subscription-access.ts";

const pastDueAt = new Date("2026-10-01T12:00:00.000Z");

test("five-day grace period is inclusive and blocking starts afterward", () => {
  const subscription = { status: "past_due", pastDueAt };
  const exactLimit = new Date(pastDueAt.getTime() + PAST_DUE_GRACE_PERIOD_MS);
  const grace = getSubscriptionAccessState(subscription, exactLimit);
  const blocked = getSubscriptionAccessState(
    subscription,
    new Date(exactLimit.getTime() + 1),
  );

  assert.equal(grace.state, "grace_period");
  assert.equal(grace.canPerformOperationalMutation, true);
  assert.equal(grace.daysPastDue, 5);
  assert.equal(grace.gracePeriodEndsAt?.toISOString(), exactLimit.toISOString());
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.canPerformOperationalMutation, false);
});

test("only past_due subscriptions restrict operational access", () => {
  for (const status of ["active", "pending", "canceled", "expired"]) {
    assert.equal(
      getSubscriptionAccessState({ status }, new Date()).state,
      "active",
    );
  }
  assert.equal(getSubscriptionAccessState(null, new Date()).state, "active");
});

test("stored delinquency dates remain authoritative", () => {
  const storedLimit = new Date("2026-10-10T12:00:00.000Z");
  const access = getSubscriptionAccessState(
    { status: "past_due", pastDueAt, gracePeriodEndsAt: storedLimit },
    new Date("2026-10-08T12:00:00.000Z"),
  );
  assert.equal(access.pastDueAt, pastDueAt);
  assert.equal(access.gracePeriodEndsAt, storedLimit);
});

test("company and school users resolve the same company subscription", async () => {
  const companyId = new ObjectId();
  const schoolId = new ObjectId();
  const subscription = { status: "past_due", pastDueAt };
  const db = {
    collection(name) {
      return {
        async findOne(query) {
          if (name === "schools") {
            assert.deepEqual(query, { _id: schoolId });
            return { companyId };
          }
          assert.equal(name, "subscriptions");
          assert.deepEqual(query, { companyId });
          return subscription;
        },
      };
    },
  };
  const now = new Date(pastDueAt.getTime() + PAST_DUE_GRACE_PERIOD_MS + 1);

  assert.equal(
    (await getOperationalAccessForAuth(db, { role: "company_admin", companyId }, now)).state,
    "blocked",
  );
  assert.equal(
    (await getOperationalAccessForAuth(db, { role: "educator", schoolId }, now)).state,
    "blocked",
  );
  assert.equal(
    (await getOperationalAccessForAuth(db, { role: "super_admin" }, now)).state,
    "active",
  );
});

test("operational creation and points routes enforce the shared server guard", async () => {
  const paths = [
    "../src/app/api/categories/route.ts",
    "../src/app/api/categories/[id]/route.ts",
    "../src/app/api/classes/route.ts",
    "../src/app/api/classes/[id]/route.ts",
    "../src/app/api/classes/[id]/students/route.ts",
    "../src/app/api/company/schools/route.ts",
    "../src/app/api/company/schools/[id]/archive/route.ts",
    "../src/app/api/educators/route.ts",
    "../src/app/api/educators/[id]/route.ts",
    "../src/app/api/admins/[id]/route.ts",
    "../src/app/api/points/route.ts",
    "../src/app/api/point-store/route.ts",
    "../src/app/api/point-store/[id]/route.ts",
    "../src/app/api/point-store/redeem/route.ts",
    "../src/app/api/products-supera/route.ts",
    "../src/app/api/products-supera/[id]/route.ts",
    "../src/app/api/products-supera/contact/route.ts",
    "../src/app/api/referrals/route.ts",
    "../src/app/api/referrals/[id]/route.ts",
    "../src/app/api/schools/[id]/admin/route.ts",
    "../src/app/api/schools/[id]/whatsapp/route.ts",
    "../src/app/api/students/import/route.ts",
    "../src/app/api/students/route.ts",
    "../src/app/api/students/[id]/route.ts",
    "../src/app/api/upload/route.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /getOperationalAccessForAuth\(db,/);
    assert.match(source, /canPerformOperationalMutation/);
    assert.match(source, /subscriptionPastDueResponse/);
  }
});

test("webhook preserves first delinquency date and audits automatic reactivation", async () => {
  const source = await readFile(
    new URL("../src/lib/billing-events.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /subscription\.pastDueAt instanceof Date/);
  assert.match(source, /PAST_DUE_GRACE_PERIOD_MS/);
  assert.match(source, /confirmsPayment && !quantityPayment && subscription\.status === "past_due"/);
  assert.match(source, /lastPastDueAt/);
  assert.match(source, /lastReactivatedAt/);
  assert.match(source, /\$unset = \{ pastDueAt: "", gracePeriodEndsAt: "" \}/);
  assert.doesNotMatch(source, /deleteOne|deleteMany|findOneAndDelete/);
});

test("quantity-change events cannot mark the recurring subscription overdue or reactivate it", async () => {
  const source = await readFile(
    new URL("../src/lib/billing-events.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(!quantityPayment\) subscriptionSet\.status = "active"/);
  assert.match(source, /event\.event === "PAYMENT_OVERDUE"[\s\S]*if \(!quantityPayment\)/);
  assert.match(source, /if \(!quantityPayment\) \{[\s\S]*collection\("companies"\)\.updateOne/);
});

test("overdue charge stays payable through read-only Pix retrieval", async () => {
  const [summary, pix] = await Promise.all([
    readFile(new URL("../src/app/api/company/billing/summary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/company/billing/payment/[id]/pix/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(summary, /\["PENDING", "OVERDUE"\]\.includes\(payment\.status\)/);
  assert.match(pix, /\["PENDING", "OVERDUE"\]\.includes\(payment\.status\)/);
  assert.doesNotMatch(pix, /createAsaas|updateAsaas|method:\s*"(POST|PUT|PATCH|DELETE)"/);
});
