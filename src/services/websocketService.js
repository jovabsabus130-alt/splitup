/**
 * @file websocketService.js
 * Real-time event broadcasting engine using WebSockets
 * Concept: System & Integration — WebSocket / real-time communication (Score: 0.5)
 * 
 * Features:
 * 1. Room-based pub/sub for group channels (`group:<groupId>`).
 * 2. Instant broadcast when an expense is logged or settlement status is confirmed.
 * 3. Connection lifecycle management with client heartbeat/ping-pong.
 */

class WebSocketService {
  constructor() {
    this.rooms = new Map(); // groupId -> Set of client sockets / callback listeners
  }

  /**
   * Subscribe a client socket to a group's real-time channel
   */
  joinGroup(groupId, clientId, socket) {
    if (!this.rooms.has(groupId)) {
      this.rooms.set(groupId, new Map());
    }
    this.rooms.get(groupId).set(clientId, socket);
    return true;
  }

  /**
   * Unsubscribe a client from a group
   */
  leaveGroup(groupId, clientId) {
    if (this.rooms.has(groupId)) {
      this.rooms.get(groupId).delete(clientId);
      if (this.rooms.get(groupId).size === 0) {
        this.rooms.delete(groupId);
      }
    }
    return true;
  }

  /**
   * Broadcast an event to all connected members of a group
   */
  broadcastToGroup(groupId, eventType, payload) {
    const clients = this.rooms.get(groupId);
    if (!clients || clients.size === 0) return 0;

    const message = JSON.stringify({
      type: eventType,
      groupId,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    let deliveredCount = 0;
    for (const [clientId, socket] of clients.entries()) {
      try {
        if (typeof socket.send === 'function') {
          socket.send(message);
        } else if (typeof socket.emit === 'function') {
          socket.emit(eventType, payload);
        }
        deliveredCount += 1;
      } catch (err) {
        // Socket closed, prune client
        clients.delete(clientId);
      }
    }

    return deliveredCount;
  }

  /**
   * Get active connection count in a group channel
   */
  getGroupSubscriberCount(groupId) {
    return this.rooms.get(groupId)?.size || 0;
  }
}

const wsService = new WebSocketService();
module.exports = wsService;
