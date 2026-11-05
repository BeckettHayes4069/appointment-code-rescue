import { z } from "zod";
import { infrai } from "./delivery_gateway.ts";

export const rescueBody = z.object({
  appointmentRef: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  messageId: z.string().min(1).max(200),
  appointmentState: z.enum(["awaiting_verification", "confirmed", "cancelled"]),
  smsConsent: z.boolean(),
  requestId: z.string().uuid(),
}).strict();
export type RescueInput = z.infer<typeof rescueBody>;
type Gateway = {
  resend: typeof infrai.sms.resend;
  events: typeof infrai.sms.events;
};

export function createRescue(gateway: Gateway) {
  const requests = new Map<string, { fingerprint: string; result: Promise<unknown> }>();
  return async (input: RescueInput) => {
    if (input.appointmentState !== "awaiting_verification" || !input.smsConsent) {
      return { decision: "held", appointmentRef: input.appointmentRef, notice: "No code requested. Contact the scheduling desk." };
    }
    const fingerprint = JSON.stringify(input);
    const existing = requests.get(input.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new z.ZodError([{
        code: "custom", path: ["requestId"], message: "Use the same request ID only for the same input",
      }]);
      return existing.result;
    }
    if (requests.size >= 10000) throw new Error("Restart the demo service to start a new session");
    const result = (async () => {
      const delivery = await gateway.resend(input.messageId, input.requestId);
      return {
        decision: "resend_requested", appointmentRef: input.appointmentRef,
        notice: "A verification code was requested. Keep it private.",
        delivery,
      };
    })();
    requests.set(input.requestId, { fingerprint, result });
    return result;
  };
}
