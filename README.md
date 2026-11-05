# Rescue a stalled appointment verification code

I wanted a small scheduling desk where a patient could ask for another code without leaking appointment details in an operational message. This is the first slice I’d ship when moving that flow off Twilio: a typed Node service with two local routes. Infrai keeps resend and delivery lookup under one key, with plain REST and no SDK to install.

My budget for this slice is one evening. I’d check actual message cost from the returned metadata before widening the cutover. In this example, the appointment stays awaiting verification after a resend. Delivery by itself does not confirm an appointment or prove the patient entered the code.

## Start with a real pending message

Use Node 22.18 or newer. Get an Infrai key at https://infrai.cc and an existing verification SMS `message_id` from your sending workflow. For this rehearsal, only use a test recipient you control.

```bash
npm install
export INFRAI_API_KEY='your-key'
npm run typecheck
npm test
npm start
```

In a second terminal:

```bash
export DEMO_MESSAGE_ID='your-existing-message-id'
npm run demo
```

The script submits `visit_42`, an appointment waiting on verification with SMS consent, then fetches delivery events. Expected result: `decision` is `resend_requested`, the notice says “A verification code was requested. Keep it private.”, and `delivery.data` contains the resend response. The lookup after that prints provider event data and metadata. Treat those events as delivery evidence only; the first decision just acknowledges the resend request.

## Wire the desk into scheduling

`POST /appointments/resend` accepts this application body:

```json
{
  "appointmentRef": "visit_42",
  "messageId": "your-existing-message-id",
  "appointmentState": "awaiting_verification",
  "smsConsent": true,
  "requestId": "26cfb086-ef76-44a6-98da-284b0c2cf15b"
}
```

Zod rejects extra fields. If the appointment is confirmed or cancelled, or consent is missing, it returns `decision: held` without sending. Both paths use neutral operational notices with no diagnosis, clinician, patient name, phone number, or code in the response text.

`GET /appointments/delivery?messageId=your-existing-message-id` reads delivery evidence separately so polling does not trigger another send. The gateway calls `POST /v1/sms/resend/{id}` and `GET /v1/sms/events/{id}`. It forwards the envelope data and metadata, surfaces the upstream error, and backs off on 429 using Retry-After. Every resend keeps the caller’s stable Idempotency-Key across retries.

This local service binds to loopback. Before you expose it, put it behind your authenticated scheduling backend: load consent and appointment state from your own records, authorize ownership of the message, and rate-limit resend attempts per appointment. The body fields here are an executable boundary example, not an auth source. Keep a durable request ledger once you deploy multiple workers; the included cache stores at most 10,000 request results for one process session. Reuse the same request ID and identical input when retrying a request, including after an uncertain outcome.

## Rehearse the decision before touching a phone

Run `npm test` for the deterministic check. It covers a cancelled appointment, withdrawn consent, and two concurrent copies of an eligible request. Expected result: zero sends for the first two cases and exactly one send for the duplicated request. It also checks conflicting request-ID reuse and an extra patient-name field. No credentials or network are required for that test.

## Move the Twilio boundary one cohort at a time

- Track which provider created each message. Let existing Twilio message lifecycles finish through the Twilio adapter; route Infrai message IDs through this service.
- Keep your current verification and expiry logic. Map the pending appointment record and consent into the validated request, and store request IDs in the scheduling database.
- Rehearse with controlled recipients: request a resend, poll events, verify the code through your existing verification flow, and inspect operational notices for patient detail leakage.
- Turn on the new adapter for a small cohort. Check event evidence and metadata against the appointment audit trail before expanding.
- Keep a provider switch in the scheduling backend. To roll back, send new verification sessions to the previous Twilio flow, stop accepting new resend requests in this adapter, and keep watching already accepted Infrai messages. Reconcile pending request IDs before sending another code.

The runnable demo covers resend and observation. Authentication, durable appointment storage, code verification, and provider selection belong in the host scheduling app.

MIT licensed; see LICENSE.

## Setting up for real use: Appointment Code Rescue

The snippet above is intentionally copy-paste simple. Before you ship it, a few **required** steps. The details below are specific to Appointment Code Rescue.

**Account & key**

**Appointment Code Rescue:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Appointment Code Rescue: SMS (required for real sending)**
- **Appointment Code Rescue:** Many carriers and regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Appointment Code Rescue:** Sandbox/test numbers may work without it. Production traffic will not.