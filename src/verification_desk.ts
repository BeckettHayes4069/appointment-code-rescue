import { createServer } from "node:http";
import { ZodError } from "zod";
import { createRescue, rescueBody } from "./appointment_rescue.ts";
import { DeliveryError, infrai } from "./delivery_gateway.ts";

const rescue = createRescue({
  resend: (messageId, requestId) => infrai.sms.resend(messageId, requestId),
  events: (messageId) => infrai.sms.events(messageId),
});
const server = createServer(async (req, res) => {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/appointments/resend") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 8192) { reply(413, { error: "Request too large" }); return; }
      }
      reply(200, await rescue(rescueBody.parse(JSON.parse(raw))));
    } else if (req.method === "GET" && url.pathname === "/appointments/delivery") {
      const messageId = url.searchParams.get("messageId");
      if (!messageId || messageId.length > 200) { reply(400, { error: "messageId required" }); return; }
      reply(200, { messageId, delivery: await infrai.sms.events(messageId) });
    } else reply(404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) reply(400, { error: "Invalid request body" });
    else if (error instanceof DeliveryError) reply(error.status < 500 ? error.status : 502, { error: error.detail });
    else reply(502, { error: "Delivery request could not complete" });
  }
});
server.listen(3000, "127.0.0.1", () => console.log("Verification desk: http://127.0.0.1:3000"));
