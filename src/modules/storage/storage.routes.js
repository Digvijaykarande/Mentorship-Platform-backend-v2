import { Router } from "express";
import { z } from "zod";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/apiResponse.js";
import { handleCallback, redirectUriFor, startConnect } from "./google.service.js";
import { disconnectProvider, setActiveProvider, storageOverview } from "./overview.service.js";
import { PROVIDER_IDS } from "./providers.js";

const router = Router();

/**
 * Google sends the admin's browser here after the consent screen. There is no Bearer token on this
 * request, so it is protected by the signed `state` instead (see oauthState.js). Always ends in a redirect.
 */
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  res.redirect(await handleCallback({ code: String(code ?? ""), state: String(state ?? ""), error: error ? String(error) : "" }));
});

router.use(authenticate, authorize(ROLES.ADMIN));

// Both providers, live account details and what is stored where. ?refresh=1 skips the 1-minute cache.
router.get("/overview", validate({ query: z.object({ refresh: z.enum(["0", "1"]).optional() }) }), async (req, res) =>
  ok(res, { ...(await storageOverview({ refresh: req.validated.query.refresh === "1" })), redirectUri: redirectUriFor(req) }),
);

// Switch where NEW uploads go.
router.put("/active", validate({ body: z.object({ provider: z.enum(PROVIDER_IDS) }) }), async (req, res) =>
  ok(res, await setActiveProvider(req.user, req.body.provider), { message: "Storage updated" }),
);

// Save the Google credentials (optional) and get the Google consent URL to send the admin to.
const connectBody = z.object({
  clientId: z.string().trim().min(10).max(300).optional(),
  clientSecret: z.string().trim().min(8).max(300).optional(),
  returnTo: z.string().trim().max(300).optional(),
});
router.post("/providers/gdrive/connect", validate({ body: connectBody }), async (req, res) =>
  ok(res, await startConnect(req.user, req, req.body)),
);

router.delete("/providers/:provider", validate({ params: z.object({ provider: z.enum(PROVIDER_IDS) }) }), async (req, res) =>
  ok(res, await disconnectProvider(req.user, req.params.provider), { message: "Disconnected" }),
);

export default router;
