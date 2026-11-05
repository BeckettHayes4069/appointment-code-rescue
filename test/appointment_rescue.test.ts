import { test } from "node:test";
import assert from "node:assert/strict";
import { createRescue, rescueBody } from "../src/appointment_rescue.ts";

test("only a consenting appointment awaiting verification can resend, once per request", async () => {
  let sends = 0;
  const rescue = createRescue({
    resend: async () => { sends++; return { data: { message_id: "resent_42" }, metadata: {} }; },
    events: async () => ({ data: [], metadata: {} }),
  });
  const input = rescueBody.parse({ appointmentRef: "visit_42", messageId: "original_42", appointmentState: "awaiting_verification", smsConsent: true, requestId: "26cfb086-ef76-44a6-98da-284b0c2cf15b" });
  const held = await rescue({ ...input, appointmentState: "cancelled" }) as { decision: string };
  assert.equal(held.decision, "held");
  await rescue({ ...input, smsConsent: false });
  assert.equal(sends, 0);
  const results = await Promise.all([rescue(input), rescue(input)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(sends, 1);
  await assert.rejects(() => rescue({ ...input, messageId: "another" }));
  assert.equal(rescueBody.safeParse({ ...input, patientName: "excluded" }).success, false);
});
