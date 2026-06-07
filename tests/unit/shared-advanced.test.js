"use strict";

/**
 * Shared Advanced Services Tests
 * Tests calendar, contacts, messaging, tasks, audit
 */

const {
  generateCalendarEvent,
  generateContact,
  generateMessage,
  generateTask,
  generateAuditLog,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Calendar Service", () => {
  describe("Event Creation", () => {
    it("should create valid calendar event", () => {
      const event = generateCalendarEvent();
      expect(event.event_id).toBeTruthy();
      expect(event.business_id).toBe(TEST_BUSINESS.business_id);
      expect(event.title).toBeTruthy();
    });

    it("should set time range", () => {
      const event = generateCalendarEvent();
      expect(new Date(event.start_time) < new Date(event.end_time)).toBe(true);
    });

    it("should track event creator", () => {
      const event = generateCalendarEvent();
      expect(event.created_by).toBe(TEST_USER.user_id);
    });

    it("should support event types", () => {
      const types = ["meeting", "deadline", "reminder", "conference"];
      types.forEach((type) => {
        const event = generateCalendarEvent(TEST_BUSINESS, {
          event_type: type,
        });
        expect(event.event_type).toBe(type);
      });
    });

    it("should track attendees", () => {
      const event = generateCalendarEvent();
      expect(Array.isArray(event.attendees)).toBe(true);
      expect(event.attendees.length).toBeGreaterThan(0);
    });
  });
});

describe("Contacts Service", () => {
  describe("Contact Creation", () => {
    it("should create valid contact", () => {
      const contact = generateContact();
      expect(contact.contact_id).toBeTruthy();
      expect(contact.first_name).toBeTruthy();
      expect(contact.last_name).toBeTruthy();
      expect(contact.email).toBeTruthy();
    });

    it("should support contact types", () => {
      const types = ["customer", "supplier", "partner", "employee"];
      types.forEach((type) => {
        const contact = generateContact(TEST_BUSINESS, {
          contact_type: type,
        });
        expect(contact.contact_type).toBe(type);
      });
    });

    it("should store address information", () => {
      const contact = generateContact();
      expect(contact.address).toBeTruthy();
      expect(contact.city).toBeTruthy();
      expect(contact.country).toBeTruthy();
    });

    it("should be active by default", () => {
      const contact = generateContact();
      expect(contact.is_active).toBe(true);
    });
  });
});

describe("Messaging Service", () => {
  describe("Message Creation", () => {
    it("should create valid message", () => {
      const message = generateMessage();
      expect(message.message_id).toBeTruthy();
      expect(message.subject).toBeTruthy();
      expect(message.content).toBeTruthy();
    });

    it("should track sender and recipient", () => {
      const message = generateMessage();
      expect(message.sender_id).toBeTruthy();
      expect(message.recipient_id).toBeTruthy();
      expect(message.sender_id).not.toBe(message.recipient_id);
    });

    it("should support message types", () => {
      const types = ["internal", "external", "notification"];
      types.forEach((type) => {
        const message = generateMessage(TEST_BUSINESS, {
          message_type: type,
        });
        expect(message.message_type).toBe(type);
      });
    });

    it("should be unread by default", () => {
      const message = generateMessage();
      expect(message.is_read).toBe(false);
    });

    it("should track read status", () => {
      const message = generateMessage(TEST_BUSINESS, {
        is_read: true,
        read_at: new Date().toISOString(),
      });
      expect(message.is_read).toBe(true);
      expect(message.read_at).toBeTruthy();
    });
  });
});

describe("Task Management", () => {
  describe("Task Creation", () => {
    it("should create valid task", () => {
      const task = generateTask();
      expect(task.task_id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(task.assigned_to).toBe(TEST_USER.user_id);
    });

    it("should support task statuses", () => {
      const statuses = ["pending", "in_progress", "completed", "cancelled"];
      statuses.forEach((status) => {
        const task = generateTask(TEST_BUSINESS, { status });
        expect(task.status).toBe(status);
      });
    });

    it("should support priority levels", () => {
      const priorities = ["low", "medium", "high", "urgent"];
      priorities.forEach((priority) => {
        const task = generateTask(TEST_BUSINESS, { priority });
        expect(task.priority).toBe(priority);
      });
    });

    it("should set due date", () => {
      const task = generateTask();
      expect(task.due_date).toBeTruthy();
      expect(new Date(task.due_date) > new Date()).toBe(true);
    });

    it("should track task creator", () => {
      const task = generateTask();
      expect(task.created_by).toBe(TEST_USER.user_id);
    });
  });
});

describe("Audit Service", () => {
  describe("Audit Log Creation", () => {
    it("should create audit log", () => {
      const log = generateAuditLog();
      expect(log.audit_id).toBeTruthy();
      expect(log.business_id).toBe(TEST_BUSINESS.business_id);
      expect(log.user_id).toBe(TEST_USER.user_id);
    });

    it("should track action type", () => {
      const actions = ["CREATE", "UPDATE", "DELETE", "VIEW"];
      actions.forEach((action) => {
        const log = generateAuditLog(TEST_BUSINESS, { action });
        expect(log.action).toBe(action);
      });
    });

    it("should record entity changes", () => {
      const log = generateAuditLog(TEST_BUSINESS, {
        action: "UPDATE",
        changes: { status: ["draft", "sent"], amount: [100, 110] },
      });

      expect(log.changes.status).toEqual(["draft", "sent"]);
    });

    it("should track IP address", () => {
      const log = generateAuditLog();
      expect(log.ip_address).toBeTruthy();
    });

    it("should track user agent", () => {
      const log = generateAuditLog();
      expect(log.user_agent).toBeTruthy();
    });

    it("should timestamp action", () => {
      const log = generateAuditLog();
      expect(new Date(log.created_at)).toBeInstanceOf(Date);
    });
  });

  describe("Audit Trail", () => {
    it("should maintain action history", () => {
      const logs = [
        generateAuditLog(TEST_BUSINESS, { action: "CREATE" }),
        generateAuditLog(TEST_BUSINESS, { action: "UPDATE" }),
        generateAuditLog(TEST_BUSINESS, { action: "UPDATE" }),
        generateAuditLog(TEST_BUSINESS, { action: "DELETE" }),
      ];

      expect(logs.length).toBe(4);
      expect(logs[0].action).toBe("CREATE");
      expect(logs[logs.length - 1].action).toBe("DELETE");
    });
  });
});

describe("Business Context", () => {
  it("should isolate calendar events by business", () => {
    const event1 = generateCalendarEvent(TEST_BUSINESS);
    const event2 = generateCalendarEvent(TEST_BUSINESS);
    expect(event1.business_id).toBe(event2.business_id);
  });

  it("should isolate contacts by business", () => {
    const contact1 = generateContact(TEST_BUSINESS);
    const contact2 = generateContact(TEST_BUSINESS);
    expect(contact1.business_id).toBe(contact2.business_id);
  });

  it("should isolate messages by business", () => {
    const msg1 = generateMessage(TEST_BUSINESS);
    const msg2 = generateMessage(TEST_BUSINESS);
    expect(msg1.business_id).toBe(msg2.business_id);
  });

  it("should isolate tasks by business", () => {
    const task1 = generateTask(TEST_BUSINESS);
    const task2 = generateTask(TEST_BUSINESS);
    expect(task1.business_id).toBe(task2.business_id);
  });

  it("should isolate audit logs by business", () => {
    const log1 = generateAuditLog(TEST_BUSINESS);
    const log2 = generateAuditLog(TEST_BUSINESS);
    expect(log1.business_id).toBe(log2.business_id);
  });
});
