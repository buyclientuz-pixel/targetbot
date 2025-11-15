import assert from "node:assert/strict";
import test from "node:test";
import { parseMetaWebhookPayload } from "../../src/services/meta-webhook.ts";

test("parseMetaWebhookPayload", async (t) => {
  await t.test("extracts lead details and project id from webhook entry", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "123",
          time: 1731600000,
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "343782",
                project_id: "birlash",
                created_time: 1731600000,
                campaign_name: "Лиды - тест",
                ad_name: "Креатив №3",
                field_data: [
                  { name: "Full Name", values: ["Sharofat Ona"] },
                  { name: "phone_number", values: ["+998902867999"] },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = parseMetaWebhookPayload(payload);
    assert.equal(events.length, 1);
    const [event] = events;
    assert.equal(event.projectId, "birlash");
    assert.equal(event.lead.id, "343782");
    assert.equal(event.lead.name, "Sharofat Ona");
    assert.equal(event.lead.phone, "+998902867999");
    assert.equal(event.lead.campaign, "Лиды - тест");
    assert.equal(event.lead.ad, "Креатив №3");
    assert.equal(event.lead.status, "NEW");
    assert.equal(event.lead.source, "facebook");
    assert.equal(new Date(event.lead.createdAt).toISOString(), event.lead.createdAt);
  });

  await t.test("throws validation error when project id cannot be resolved", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "123",
          time: 1731600000,
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "343782",
                field_data: [{ name: "Full Name", values: ["Sharofat Ona"] }],
              },
            },
          ],
        },
      ],
    };

    assert.throws(() => parseMetaWebhookPayload(payload), /projectId/);
  });
});
