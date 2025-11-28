// ============================================
// CONNECTION MANAGER CLASS (ESM)
// ============================================
class ConnectionManager {
  constructor() {
    this.connections = new Map(); // { sessionId: connection_object }
    this.connectingState = new Set(); // sessionIds currently connecting
  }

  // Get all connected sessions
  getAllConnections() {
    const allConnections = [];
    for (const [sessionId, connection] of this.connections.entries()) {
      allConnections.push({
        sessionId,
        connection,
      });
    }
    return allConnections;
  }

  // Check if already connected
  isConnected(sessionId) {
    return this.connections.has(sessionId);
  }

  // Check if currently connecting
  isConnecting(sessionId) {
    return this.connectingState.has(sessionId);
  }

  // Mark session as connecting
  setConnecting(sessionId) {
    this.connectingState.add(sessionId);
  }

  // Remove from connecting state
  removeConnecting(sessionId) {
    this.connectingState.delete(sessionId);
  }

  // Add successful connection
  addConnection(sessionId, connection) {
    this.connections.set(sessionId, connection);
    this.removeConnecting(sessionId);
  }

  // Get specific connection
  getConnection(sessionId) {
    return this.connections.get(sessionId);
  }

  // Remove connection
  removeConnection(sessionId) {
    this.connections.delete(sessionId);
    this.removeConnecting(sessionId);
  }
}

// Initialize manager
const manager = new ConnectionManager();

export default manager;

