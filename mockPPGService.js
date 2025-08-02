// mockPPGService.js - Mock data for testing voice service independently

const MOCK_USERS = {
  'demo-user': {
    currentHeartRate: 72,
    currentOxygen: 98,
    trends: [
      { date: '2025-07-30', avgHeartRate: 68, avgOxygen: 97, trend: 'stable' },
      { date: '2025-07-31', avgHeartRate: 70, avgOxygen: 98, trend: 'improving' },
      { date: '2025-08-01', avgHeartRate: 71, avgOxygen: 98, trend: 'stable' },
      { date: '2025-08-02', avgHeartRate: 72, avgOxygen: 98, trend: 'stable' }
    ],
    lastMeasurement: new Date().toISOString()
  }
};

// Mock PPG API responses
function mockPPGService() {
  return {
    // Mock heart rate measurement
    async measureHeartRate(userId) {
      const user = MOCK_USERS[userId] || MOCK_USERS['demo-user'];
      // Simulate slight variation in readings
      const variation = Math.floor(Math.random() * 6) - 3; // -3 to +3
      const heartRate = user.currentHeartRate + variation;
      
      return {
        heartRate: heartRate,
        confidence: 0.95,
        measurementId: 'hr-' + Date.now(),
        timestamp: new Date().toISOString(),
        status: 'completed'
      };
    },

    // Mock blood oxygen measurement
    async measureOxygen(userId) {
      const user = MOCK_USERS[userId] || MOCK_USERS['demo-user'];
      // Simulate slight variation
      const variation = Math.floor(Math.random() * 3) - 1; // -1 to +1
      const oxygenLevel = Math.min(100, user.currentOxygen + variation);
      
      return {
        oxygenLevel: oxygenLevel,
        confidence: 0.92,
        measurementId: 'ox-' + Date.now(),
        timestamp: new Date().toISOString(),
        status: 'completed'
      };
    },

    // Mock health trends
    async getHealthTrends(userId) {
      const user = MOCK_USERS[userId] || MOCK_USERS['demo-user'];
      return {
        trends: user.trends,
        summary: {
          avgHeartRate: user.currentHeartRate,
          avgOxygen: user.currentOxygen,
          totalMeasurements: user.trends.length,
          lastMeasurement: user.lastMeasurement
        }
      };
    },

    // Mock general analysis
    async analyzeVitals(userId) {
      const hrData = await this.measureHeartRate(userId);
      const oxData = await this.measureOxygen(userId);
      
      return {
        heartRate: hrData.heartRate,
        oxygenLevel: oxData.oxygenLevel,
        overallStatus: 'normal',
        recommendations: [
          'Continue regular monitoring',
          'Maintain healthy lifestyle',
          'Consider daily measurements'
        ],
        measurementId: 'full-' + Date.now(),
        timestamp: new Date().toISOString()
      };
    }
  };
}

module.exports = mockPPGService;