const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Comprehensive Notification System Integration Tests', () => {
  class MockNotificationApp {
    constructor() {
      this.reset();
    }

    reset() {
      this.users = [
        { id: 'user_admin', name: 'Alice Admin', email: 'alice@example.com' },
        { id: 'user_member1', name: 'Bob Member', email: 'bob@example.com' },
        { id: 'user_member2', name: 'Charlie Member', email: 'charlie@example.com' },
        { id: 'user_requester', name: 'David Requester', email: 'david@example.com' },
      ];

      this.groups = [
        { id: 'group_1', name: 'Apartment Flatmates', adminId: 'user_admin' },
      ];

      this.memberships = [
        { userId: 'user_admin', groupId: 'group_1' },
        { userId: 'user_member1', groupId: 'group_1' },
      ];

      this.joinRequests = [];
      this.expenses = [];
      this.splits = [];
      this.concerns = [];
      this.notifications = [];
    }

    // 1. Direct Member Add / Invitation
    async addMemberDirectly(inviterId, groupId, targetUserId) {
      const isMember = this.memberships.some((m) => m.userId === inviterId && m.groupId === groupId);
      if (!isMember) return { status: 403, error: 'Forbidden' };

      const group = this.groups.find((g) => g.id === groupId);
      const inviter = this.users.find((u) => u.id === inviterId);

      this.memberships.push({ userId: targetUserId, groupId });

      if (targetUserId !== inviterId) {
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: targetUserId,
          groupId,
          type: 'group_invitation',
          title: 'Added to Group',
          message: `${inviter?.name} added you to "${group.name}".`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      return { status: 201, success: true };
    }

    // 2. Submit Join Request
    async submitJoinRequest(requesterId, groupId) {
      const group = this.groups.find((g) => g.id === groupId);
      const requester = this.users.find((u) => u.id === requesterId);

      const reqObj = {
        id: `req_${Date.now()}_${Math.random()}`,
        groupId,
        userId: requesterId,
        status: 'pending',
      };
      this.joinRequests.push(reqObj);

      if (group.adminId && group.adminId !== requesterId) {
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: group.adminId,
          groupId,
          type: 'join_request',
          title: 'New Join Request',
          message: `${requester?.name} requested to join "${group.name}".`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      return { status: 201, joinRequest: reqObj };
    }

    // 3. Resolve Join Request (Approve / Deny)
    async resolveJoinRequest(adminId, groupId, requestId, decision) {
      const group = this.groups.find((g) => g.id === groupId);
      if (group.adminId !== adminId) return { status: 403, error: 'Only admin can manage requests' };

      const reqObj = this.joinRequests.find((r) => r.id === requestId);
      if (!reqObj) return { status: 404, error: 'Not found' };

      reqObj.status = decision;
      if (decision === 'approved') {
        this.memberships.push({ userId: reqObj.userId, groupId });
      }

      if (reqObj.userId !== adminId) {
        const isApproved = decision === 'approved';
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: reqObj.userId,
          groupId,
          type: isApproved ? 'join_request_approved' : 'join_request_denied',
          title: isApproved ? 'Join Request Approved' : 'Join Request Denied',
          message: isApproved
            ? `Your request to join "${group.name}" was approved!`
            : `Your request to join "${group.name}" was denied by the group admin.`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      return { status: 200, success: true };
    }

    // 4. Create Group Expense
    async createExpense(creatorId, groupId, payload) {
      const group = this.groups.find((g) => g.id === groupId);
      const creator = this.users.find((u) => u.id === creatorId);

      const expense = {
        id: `exp_${Date.now()}_${Math.random()}`,
        groupId,
        paidById: payload.paidById || creatorId,
        amount: payload.amount,
        category: payload.category,
        description: payload.description,
        isEdited: false,
        createdAt: new Date(),
      };
      this.expenses.push(expense);

      const allMembers = this.memberships.filter((m) => m.groupId === groupId);
      const recipientIds = Array.from(new Set(allMembers.map((m) => m.userId))).filter((uid) => uid !== creatorId);

      recipientIds.forEach((uid) => {
        const userSplit = (payload.splits || []).find((s) => s.userId === uid);
        const shareText = userSplit ? ` Your share: ₹${Number(userSplit.share).toFixed(2)}.` : '';
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: uid,
          groupId,
          type: 'expense_created',
          title: 'New Expense Added',
          message: `${creator?.name} added "${payload.description || payload.category}" (₹${payload.amount.toFixed(2)}) in ${group.name}.${shareText}`,
          isRead: false,
          createdAt: new Date(),
        });
      });

      return { status: 201, expense };
    }

    // 5. Edit Group Expense
    async editExpense(editorId, groupId, expenseId, payload) {
      const group = this.groups.find((g) => g.id === groupId);
      const editor = this.users.find((u) => u.id === editorId);
      const exp = this.expenses.find((e) => e.id === expenseId);

      exp.amount = payload.amount;
      exp.description = payload.description;
      exp.isEdited = true;

      const allMembers = this.memberships.filter((m) => m.groupId === groupId);
      const recipientIds = Array.from(new Set(allMembers.map((m) => m.userId))).filter((uid) => uid !== editorId);

      recipientIds.forEach((uid) => {
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: uid,
          groupId,
          type: 'expense_edited',
          title: 'Expense Updated',
          message: `${editor?.name} updated "${payload.description || exp.category}" (₹${payload.amount.toFixed(2)}) in ${group.name}.`,
          isRead: false,
          createdAt: new Date(),
        });
      });

      return { status: 200, expense: exp };
    }

    // 6. Raise Concern
    async raiseConcern(raiserId, groupId, expenseId, reason) {
      const exp = this.expenses.find((e) => e.id === expenseId);
      const raiser = this.users.find((u) => u.id === raiserId);
      const group = this.groups.find((g) => g.id === groupId);

      const concern = {
        id: `concern_${Date.now()}_${Math.random()}`,
        expenseId,
        raisedById: raiserId,
        reason,
        status: 'pending',
      };
      this.concerns.push(concern);

      if (exp.paidById !== raiserId) {
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: exp.paidById,
          groupId,
          type: 'concern_raised',
          title: 'Transaction Concern Raised',
          message: `${raiser?.name} raised a concern regarding "${exp.description || exp.category}" in ${group.name}: "${reason}"`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      return { status: 201, concern };
    }

    // 7. Respond to Concern
    async respondToConcern(payerId, groupId, expenseId, concernId, responseText, status = 'resolved') {
      const exp = this.expenses.find((e) => e.id === expenseId);
      const concern = this.concerns.find((c) => c.id === concernId);
      const payer = this.users.find((u) => u.id === payerId);
      const group = this.groups.find((g) => g.id === groupId);

      concern.payerResponse = responseText;
      concern.status = status;

      if (concern.raisedById !== payerId) {
        this.notifications.push({
          id: `notif_${Date.now()}_${Math.random()}`,
          userId: concern.raisedById,
          groupId,
          type: 'concern_responded',
          title: 'Response to Transaction Concern',
          message: `${payer?.name} responded to your concern on "${exp.description || exp.category}" in ${group.name}: "${responseText}"`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      return { status: 200, concern };
    }

    // Notification Read Handlers
    getUserNotifications(userId) {
      const list = this.notifications.filter((n) => n.userId === userId);
      const unreadCount = list.filter((n) => !n.isRead).length;
      return { notifications: list, unreadCount };
    }

    markSingleRead(userId, notifId) {
      const notif = this.notifications.find((n) => n.id === notifId && n.userId === userId);
      if (notif) notif.isRead = true;
      return notif;
    }

    markAllRead(userId) {
      this.notifications.filter((n) => n.userId === userId).forEach((n) => { n.isRead = true; });
    }
  }

  const app = new MockNotificationApp();

  it('1. Group invitation sends notification only to the invited user', async () => {
    app.reset();

    await app.addMemberDirectly('user_admin', 'group_1', 'user_member2');

    const notifs = app.getUserNotifications('user_member2');
    assert.strictEqual(notifs.notifications.length, 1);
    assert.strictEqual(notifs.notifications[0].type, 'group_invitation');
    assert.strictEqual(notifs.unreadCount, 1);

    // Admin should not receive the invitation notification
    const adminNotifs = app.getUserNotifications('user_admin');
    assert.strictEqual(adminNotifs.notifications.length, 0);
  });

  it('2. Join request sends notification only to group admin', async () => {
    const res = await app.submitJoinRequest('user_requester', 'group_1');
    assert.strictEqual(res.status, 201);

    const adminNotifs = app.getUserNotifications('user_admin');
    assert.strictEqual(adminNotifs.notifications.length, 1);
    assert.strictEqual(adminNotifs.notifications[0].type, 'join_request');
    assert.match(adminNotifs.notifications[0].message, /David Requester/i);

    // Requester and other members should not receive join_request notification
    const reqNotifs = app.getUserNotifications('user_requester');
    assert.strictEqual(reqNotifs.notifications.length, 0);
  });

  it('3. Join request approval sends notification only to requester', async () => {
    const requestId = app.joinRequests[0].id;
    await app.resolveJoinRequest('user_admin', 'group_1', requestId, 'approved');

    const reqNotifs = app.getUserNotifications('user_requester');
    assert.strictEqual(reqNotifs.notifications.length, 1);
    assert.strictEqual(reqNotifs.notifications[0].type, 'join_request_approved');
  });

  it('4. New expense sends exactly 1 notification per other group member (no split duplication)', async () => {
    // Current group members: user_admin, user_member1, user_member2, user_requester (4 members)
    const expRes = await app.createExpense('user_admin', 'group_1', {
      amount: 1200,
      category: 'Groceries',
      description: 'Weekly Supermarket Haul',
      splits: [
        { userId: 'user_admin', share: 300 },
        { userId: 'user_member1', share: 300 },
        { userId: 'user_member2', share: 300 },
        { userId: 'user_requester', share: 300 },
      ],
    });
    assert.strictEqual(expRes.status, 201);

    // Each non-creator member gets exactly 1 notification
    ['user_member1', 'user_member2', 'user_requester'].forEach((uid) => {
      const notifs = app.getUserNotifications(uid).notifications.filter((n) => n.type === 'expense_created');
      assert.strictEqual(notifs.length, 1, `User ${uid} should receive exactly 1 expense_created notification`);
      assert.match(notifs[0].message, /Weekly Supermarket Haul/);
    });

    // Creator (user_admin) should not receive expense_created notification
    const adminExpNotifs = app.getUserNotifications('user_admin').notifications.filter((n) => n.type === 'expense_created');
    assert.strictEqual(adminExpNotifs.length, 0);
  });

  it('5. Expense edited sends notification to all group members except the editor', async () => {
    const expenseId = app.expenses[0].id;

    await app.editExpense('user_admin', 'group_1', expenseId, {
      amount: 1400,
      description: 'Weekly Supermarket Haul (Adjusted)',
    });

    ['user_member1', 'user_member2', 'user_requester'].forEach((uid) => {
      const notifs = app.getUserNotifications(uid).notifications.filter((n) => n.type === 'expense_edited');
      assert.strictEqual(notifs.length, 1);
      assert.match(notifs[0].message, /Adjusted/);
    });
  });

  it('6. Transaction concern raised notifies only the payer', async () => {
    const expenseId = app.expenses[0].id; // Payer is user_admin

    const cRes = await app.raiseConcern('user_member1', 'group_1', expenseId, 'Was ice cream shared equally?');
    assert.strictEqual(cRes.status, 201);

    const adminConcernNotifs = app.getUserNotifications('user_admin').notifications.filter((n) => n.type === 'concern_raised');
    assert.strictEqual(adminConcernNotifs.length, 1);
    assert.match(adminConcernNotifs[0].message, /ice cream/i);

    // Raiser should not receive concern_raised notification
    const raiserNotifs = app.getUserNotifications('user_member1').notifications.filter((n) => n.type === 'concern_raised');
    assert.strictEqual(raiserNotifs.length, 0);
  });

  it('7. Concern response notifies only the concern creator', async () => {
    const expenseId = app.expenses[0].id;
    const concernId = app.concerns[0].id; // Raised by user_member1

    await app.respondToConcern('user_admin', 'group_1', expenseId, concernId, 'Yes, ice cream was for the house party.');

    const raiserRespNotifs = app.getUserNotifications('user_member1').notifications.filter((n) => n.type === 'concern_responded');
    assert.strictEqual(raiserRespNotifs.length, 1);
    assert.match(raiserRespNotifs[0].message, /house party/i);
  });

  it('8. Unread counts, mark single read, and mark all read work accurately', () => {
    const statusBefore = app.getUserNotifications('user_member1');
    assert.ok(statusBefore.unreadCount > 0);

    const firstNotif = statusBefore.notifications[0];
    app.markSingleRead('user_member1', firstNotif.id);

    const statusAfterSingle = app.getUserNotifications('user_member1');
    assert.strictEqual(statusAfterSingle.unreadCount, statusBefore.unreadCount - 1);

    app.markAllRead('user_member1');
    const statusAfterAll = app.getUserNotifications('user_member1');
    assert.strictEqual(statusAfterAll.unreadCount, 0);
  });
});
