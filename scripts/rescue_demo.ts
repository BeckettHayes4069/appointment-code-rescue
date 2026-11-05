import { randomUUID } from "node:crypto";
const messageId = process.env.DEMO_MESSAGE_ID;
if (!messageId) throw new Error("Set DEMO_MESSAGE_ID to an existing verification SMS message_id");
const response = await fetch("http://127.0.0.1:3000/appointments/resend", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentRef: "visit_42", messageId, appointmentState: "awaiting_verification", smsConsent: true, requestId: randomUUID() }),
});
console.log(await response.json());
const events = await fetch(`http://127.0.0.1:3000/appointments/delivery?messageId=${encodeURIComponent(messageId)}`, { method: "GET" });
console.log(await events.json());
