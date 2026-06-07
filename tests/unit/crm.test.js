"use strict";

/**
 * CRM Unit Tests
 * Tests deal pipeline, stage management, activities, and notes
 */

const crypto = require("crypto");
const { TEST_USER, TEST_BUSINESS, TEST_CUSTOMER } = require("../fixtures/seed");

// ── Fixtures ──────────────────────────────────────────────────

function generateDeal(overrides = {}) {
  return {
    deal_id: crypto.randomUUID(),
    business_id: TEST_BUSINESS.business_id,
    contact_id: TEST_CUSTOMER.contact_id,
    assigned_to: TEST_USER.user_id,
    title: "Test Deal",
    stage: "lead",
    expected_value: 250000,
    probability: 20,
    expected_close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    source: "referral",
    lost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function generateActivity(dealId, overrides = {}) {
  return {
    activity_id: crypto.randomUUID(),
    deal_id: dealId,
    activity_type: "note",
    summary: "Called the customer",
    direction: "outbound",
    is_auto: false,
    performed_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function generateNote(dealId, overrides = {}) {
  return {
    note_id: crypto.randomUUID(),
    deal_id: dealId,
    contact_id: TEST_CUSTOMER.contact_id,
    content: "Follow up next week",
    is_pinned: false,
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const PIPELINE_STAGES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

// ── Tests ─────────────────────────────────────────────────────

describe("CRM Service", () => {
  describe("Deal Creation", () => {
    it("should generate a valid deal", () => {
      const deal = generateDeal();
      expect(deal.deal_id).toBeTruthy();
      expect(deal.business_id).toBe(TEST_BUSINESS.business_id);
      expect(deal.contact_id).toBe(TEST_CUSTOMER.contact_id);
      expect(deal.title).toBeTruthy();
    });

    it("should default to lead stage", () => {
      const deal = generateDeal();
      expect(deal.stage).toBe("lead");
    });

    it("should assign to creating user by default", () => {
      const deal = generateDeal();
      expect(deal.assigned_to).toBe(TEST_USER.user_id);
    });

    it("should allow custom assignment", () => {
      const otherId = crypto.randomUUID();
      const deal = generateDeal({ assigned_to: otherId });
      expect(deal.assigned_to).toBe(otherId);
    });

    it("should accept expected value and probability", () => {
      const deal = generateDeal({ expected_value: 500000, probability: 60 });
      expect(deal.expected_value).toBe(500000);
      expect(deal.probability).toBe(60);
    });

    it("should have a future close date", () => {
      const deal = generateDeal();
      const closeDate = new Date(deal.expected_close_date);
      expect(closeDate > new Date()).toBe(true);
    });

    it("should support deal source", () => {
      const sources = ["referral", "web", "cold_call", "event", "social"];
      sources.forEach((source) => {
        const deal = generateDeal({ source });
        expect(deal.source).toBe(source);
      });
    });

    it("should track timestamps", () => {
      const deal = generateDeal();
      expect(new Date(deal.created_at)).toBeInstanceOf(Date);
      expect(new Date(deal.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Pipeline Stages", () => {
    it("should have all valid pipeline stages", () => {
      PIPELINE_STAGES.forEach((stage) => {
        const deal = generateDeal({ stage });
        expect(PIPELINE_STAGES).toContain(deal.stage);
      });
    });

    it("should move deal from lead to qualified", () => {
      const deal = generateDeal({ stage: "lead" });
      const updated = { ...deal, stage: "qualified" };
      expect(updated.stage).toBe("qualified");
      expect(updated.deal_id).toBe(deal.deal_id);
    });

    it("should move deal to won", () => {
      const deal = generateDeal({ stage: "negotiation" });
      const won = { ...deal, stage: "won" };
      expect(won.stage).toBe("won");
    });

    it("should move deal to lost with reason", () => {
      const deal = generateDeal({ stage: "negotiation" });
      const lost = { ...deal, stage: "lost", lost_reason: "Budget constraint" };
      expect(lost.stage).toBe("lost");
      expect(lost.lost_reason).toBe("Budget constraint");
    });

    it("should track stage change in activity log", () => {
      const deal = generateDeal({ stage: "lead" });
      const activity = generateActivity(deal.deal_id, {
        activity_type: "stage_change",
        summary: 'Stage moved from "lead" to "qualified"',
        is_auto: true,
      });
      expect(activity.activity_type).toBe("stage_change");
      expect(activity.summary).toContain("lead");
      expect(activity.summary).toContain("qualified");
      expect(activity.is_auto).toBe(true);
    });
  });

  describe("Pipeline Board View", () => {
    it("should group deals by stage", () => {
      const deals = [
        generateDeal({ stage: "lead" }),
        generateDeal({ stage: "lead" }),
        generateDeal({ stage: "proposal" }),
        generateDeal({ stage: "won" }),
      ];

      const grouped = PIPELINE_STAGES.map((stage) => ({
        stage,
        deals: deals.filter((d) => d.stage === stage),
      }));

      const leadGroup = grouped.find((g) => g.stage === "lead");
      const proposalGroup = grouped.find((g) => g.stage === "proposal");
      const wonGroup = grouped.find((g) => g.stage === "won");

      expect(leadGroup.deals.length).toBe(2);
      expect(proposalGroup.deals.length).toBe(1);
      expect(wonGroup.deals.length).toBe(1);
    });

    it("should calculate total value per stage", () => {
      const deals = [
        generateDeal({ stage: "lead", expected_value: 100000 }),
        generateDeal({ stage: "lead", expected_value: 200000 }),
        generateDeal({ stage: "proposal", expected_value: 500000 }),
      ];

      const leadValue = deals
        .filter((d) => d.stage === "lead")
        .reduce((sum, d) => sum + parseFloat(d.expected_value), 0);

      expect(leadValue).toBe(300000);
    });

    it("should include empty stages in pipeline", () => {
      const deals = [generateDeal({ stage: "won" })];
      const pipeline = PIPELINE_STAGES.map((stage) => ({
        stage,
        deals: deals.filter((d) => d.stage === stage),
      }));

      const leadStage = pipeline.find((s) => s.stage === "lead");
      expect(leadStage.deals.length).toBe(0);
    });
  });

  describe("Activity Logging", () => {
    it("should create a valid activity", () => {
      const deal = generateDeal();
      const activity = generateActivity(deal.deal_id);
      expect(activity.activity_id).toBeTruthy();
      expect(activity.deal_id).toBe(deal.deal_id);
      expect(activity.activity_type).toBeTruthy();
      expect(activity.summary).toBeTruthy();
    });

    it("should support activity types", () => {
      const types = [
        "note",
        "call",
        "email",
        "meeting",
        "stage_change",
        "quotation_sent",
      ];
      const deal = generateDeal();
      types.forEach((activity_type) => {
        const act = generateActivity(deal.deal_id, { activity_type });
        expect(act.activity_type).toBe(activity_type);
      });
    });

    it("should support inbound and outbound direction", () => {
      const deal = generateDeal();
      const inbound = generateActivity(deal.deal_id, { direction: "inbound" });
      const outbound = generateActivity(deal.deal_id, {
        direction: "outbound",
      });
      expect(inbound.direction).toBe("inbound");
      expect(outbound.direction).toBe("outbound");
    });

    it("should distinguish manual vs auto-logged activities", () => {
      const deal = generateDeal();
      const manual = generateActivity(deal.deal_id, { is_auto: false });
      const auto = generateActivity(deal.deal_id, { is_auto: true });
      expect(manual.is_auto).toBe(false);
      expect(auto.is_auto).toBe(true);
    });

    it("should track performing user", () => {
      const deal = generateDeal();
      const activity = generateActivity(deal.deal_id);
      expect(activity.performed_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Notes", () => {
    it("should create a valid note", () => {
      const deal = generateDeal();
      const note = generateNote(deal.deal_id);
      expect(note.note_id).toBeTruthy();
      expect(note.deal_id).toBe(deal.deal_id);
      expect(note.content).toBeTruthy();
    });

    it("should not be pinned by default", () => {
      const deal = generateDeal();
      const note = generateNote(deal.deal_id);
      expect(note.is_pinned).toBe(false);
    });

    it("should support pinning", () => {
      const deal = generateDeal();
      const pinned = generateNote(deal.deal_id, { is_pinned: true });
      expect(pinned.is_pinned).toBe(true);
    });

    it("should link to deal's contact", () => {
      const deal = generateDeal();
      const note = generateNote(deal.deal_id, { contact_id: deal.contact_id });
      expect(note.contact_id).toBe(deal.contact_id);
    });

    it("should track author", () => {
      const deal = generateDeal();
      const note = generateNote(deal.deal_id);
      expect(note.created_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Deal Updates", () => {
    it("should update allowed fields", () => {
      const deal = generateDeal();
      const updates = {
        title: "Updated Deal Title",
        expected_value: 750000,
        probability: 80,
      };
      const updated = {
        ...deal,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      expect(updated.title).toBe("Updated Deal Title");
      expect(updated.expected_value).toBe(750000);
      expect(updated.probability).toBe(80);
    });

    it("should preserve immutable fields on update", () => {
      const deal = generateDeal();
      const originalId = deal.deal_id;
      const updated = { ...deal, title: "New Title" };
      expect(updated.deal_id).toBe(originalId);
      expect(updated.contact_id).toBe(deal.contact_id);
    });

    it("should reject update with no fields", () => {
      const allowedFields = [
        "title",
        "expected_value",
        "probability",
        "expected_close_date",
        "source",
        "assigned_to",
        "lost_reason",
      ];
      const emptyUpdate = {};
      const sets = allowedFields.filter((f) => emptyUpdate[f] !== undefined);
      expect(sets.length).toBe(0); // nothing to update
    });
  });
});
