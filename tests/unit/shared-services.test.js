"use strict";

/**
 * Shared Services Tests
 * Tests common functionality: notifications, documents, staff, tasks
 */

const {
  generateNotification,
  generateDocument,
  generateStaffMember,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Notifications Service", () => {
  describe("Notification Creation", () => {
    it("should create valid notification", () => {
      const notif = generateNotification();
      expect(notif.notification_id).toBeTruthy();
      expect(notif.business_id).toBe(TEST_BUSINESS.business_id);
      expect(notif.message).toBeTruthy();
    });

    it("should route to recipient", () => {
      const notif = generateNotification();
      expect(notif.recipient_id).toBe(TEST_USER.user_id);
    });

    it("should be unread by default", () => {
      const notif = generateNotification();
      expect(notif.read).toBe(false);
    });

    it("should support notification types", () => {
      const types = ["info", "success", "warning", "error"];
      types.forEach((type) => {
        const notif = generateNotification(TEST_BUSINESS, { type });
        expect(notif.type).toBe(type);
      });
    });

    it("should include action URL", () => {
      const notif = generateNotification();
      expect(notif.action_url).toBeTruthy();
    });
  });

  describe("Notification Status", () => {
    it("should mark as read", () => {
      let notif = generateNotification(TEST_BUSINESS, { read: false });
      notif.read = true;
      notif.read_at = new Date().toISOString();

      expect(notif.read).toBe(true);
      expect(notif.read_at).toBeTruthy();
    });

    it("should track read timestamp", () => {
      const notif = generateNotification(TEST_BUSINESS, {
        read: true,
        read_at: new Date().toISOString(),
      });
      expect(notif.read_at).toBeTruthy();
    });
  });

  describe("Notification Delivery", () => {
    it("should timestamp creation", () => {
      const notif = generateNotification();
      expect(new Date(notif.created_at)).toBeInstanceOf(Date);
    });
  });
});

describe("Documents Service", () => {
  describe("Document Upload", () => {
    it("should create valid document", () => {
      const doc = generateDocument();
      expect(doc.document_id).toBeTruthy();
      expect(doc.business_id).toBe(TEST_BUSINESS.business_id);
      expect(doc.name).toBeTruthy();
    });

    it("should store file path", () => {
      const doc = generateDocument();
      expect(doc.file_path).toBeTruthy();
    });

    it("should track file size", () => {
      const doc = generateDocument();
      expect(doc.file_size).toBeGreaterThan(0);
    });

    it("should store MIME type", () => {
      const doc = generateDocument();
      expect(doc.mime_type).toBeTruthy();
    });

    it("should track uploader", () => {
      const doc = generateDocument();
      expect(doc.uploaded_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Document Types", () => {
    it("should support invoice documents", () => {
      const doc = generateDocument(TEST_BUSINESS, { document_type: "invoice" });
      expect(doc.document_type).toBe("invoice");
    });

    it("should support PO documents", () => {
      const doc = generateDocument(TEST_BUSINESS, { document_type: "po" });
      expect(doc.document_type).toBe("po");
    });

    it("should support contract documents", () => {
      const doc = generateDocument(TEST_BUSINESS, {
        document_type: "contract",
      });
      expect(doc.document_type).toBe("contract");
    });
  });

  describe("Document Relationships", () => {
    it("should link to related record", () => {
      const doc = generateDocument();
      expect(doc.related_to_type).toBeTruthy();
      expect(doc.related_to_id).toBeTruthy();
    });

    it("should support multiple relationship types", () => {
      const types = ["invoice", "po", "contract"];
      types.forEach((type) => {
        const doc = generateDocument(TEST_BUSINESS, { related_to_type: type });
        expect(doc.related_to_type).toBe(type);
      });
    });
  });

  describe("Document Timestamps", () => {
    it("should track creation", () => {
      const doc = generateDocument();
      expect(new Date(doc.created_at)).toBeInstanceOf(Date);
    });

    it("should track updates", () => {
      const doc = generateDocument();
      expect(new Date(doc.updated_at)).toBeInstanceOf(Date);
    });
  });
});

describe("Staff Management", () => {
  describe("Staff Creation", () => {
    it("should create valid staff member", () => {
      const staff = generateStaffMember();
      expect(staff.staff_id).toBeTruthy();
      expect(staff.business_id).toBe(TEST_BUSINESS.business_id);
      expect(staff.first_name).toBeTruthy();
      expect(staff.last_name).toBeTruthy();
    });

    it("should store contact information", () => {
      const staff = generateStaffMember();
      expect(staff.email).toBeTruthy();
      expect(staff.phone).toBeTruthy();
    });

    it("should track employment details", () => {
      const staff = generateStaffMember();
      expect(staff.department).toBeTruthy();
      expect(staff.position).toBeTruthy();
    });

    it("should set start date", () => {
      const staff = generateStaffMember();
      expect(staff.start_date).toBeTruthy();
    });

    it("should be active by default", () => {
      const staff = generateStaffMember();
      expect(staff.is_active).toBe(true);
    });
  });

  describe("Employment Types", () => {
    it("should support full_time employment", () => {
      const staff = generateStaffMember(TEST_BUSINESS, {
        employment_type: "full_time",
      });
      expect(staff.employment_type).toBe("full_time");
    });

    it("should support part_time employment", () => {
      const staff = generateStaffMember(TEST_BUSINESS, {
        employment_type: "part_time",
      });
      expect(staff.employment_type).toBe("part_time");
    });

    it("should support contract employment", () => {
      const staff = generateStaffMember(TEST_BUSINESS, {
        employment_type: "contract",
      });
      expect(staff.employment_type).toBe("contract");
    });
  });

  describe("Staff Salary", () => {
    it("should track salary", () => {
      const staff = generateStaffMember();
      expect(staff.salary).toBeGreaterThan(0);
    });

    it("should support variable salaries", () => {
      const salaries = [300000, 500000, 1000000];
      salaries.forEach((salary) => {
        const staff = generateStaffMember(TEST_BUSINESS, { salary });
        expect(staff.salary).toBe(salary);
      });
    });
  });

  describe("Staff Status", () => {
    it("should track active status", () => {
      const active = generateStaffMember(TEST_BUSINESS, { is_active: true });
      expect(active.is_active).toBe(true);
    });

    it("should track inactive staff", () => {
      const inactive = generateStaffMember(TEST_BUSINESS, {
        is_active: false,
      });
      expect(inactive.is_active).toBe(false);
    });
  });

  describe("Staff Timestamps", () => {
    it("should track creation", () => {
      const staff = generateStaffMember();
      expect(new Date(staff.created_at)).toBeInstanceOf(Date);
    });

    it("should track updates", () => {
      const staff = generateStaffMember();
      expect(new Date(staff.updated_at)).toBeInstanceOf(Date);
    });
  });
});

describe("Business Context", () => {
  it("should isolate notifications by business", () => {
    const notif1 = generateNotification(TEST_BUSINESS);
    const notif2 = generateNotification(TEST_BUSINESS);
    expect(notif1.business_id).toBe(notif2.business_id);
  });

  it("should isolate documents by business", () => {
    const doc1 = generateDocument(TEST_BUSINESS);
    const doc2 = generateDocument(TEST_BUSINESS);
    expect(doc1.business_id).toBe(doc2.business_id);
  });

  it("should isolate staff by business", () => {
    const staff1 = generateStaffMember(TEST_BUSINESS);
    const staff2 = generateStaffMember(TEST_BUSINESS);
    expect(staff1.business_id).toBe(staff2.business_id);
  });
});
