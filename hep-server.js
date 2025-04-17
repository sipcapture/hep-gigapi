/**
 * HEP to InfluxDB Server
 * 
 * This server listens for HEP packets, converts them to InfluxDB Line Protocol format,
 * and forwards them to an InfluxDB instance.
 */

import HepToLineProtocolConverter from './hep-proto.js';
import hepjs from 'hep-js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

class HepToInfluxDBServer {
  constructor(config = {}) {
    this.config = {
      hepPort: config.hepPort || process.env.PORT || 9060,
      hepBindAddress: config.hepBindAddress || process.env.HOST || '0.0.0.0',
      influxDbUrl: config.influxDbUrl || process.env.INFLUX_DBURL || 'http://localhost:7971',
      influxDbDatabase: config.influxDbDatabase || process.env.INFLUXB_DBNAME || 'hep',
      batchSize: config.batchSize || process.env.BATCH_SIZE || 1000,
      flushInterval: config.flushInterval || process.env.FLUSH_INTERVAL || 5000, // ms
      maxBufferSize: config.maxBufferSize || process.env.MAX_BUFFER || 10000,
      debug: config.debug || false,
      writeToFile: config.writeToFile || false,
      outputDir: config.outputDir || './data'
    };

    this.buffer = [];
    this.lastFlushTime = Date.now();
    this.converter = new HepToLineProtocolConverter();
    this.converter.setDebug(this.config.debug);
    
    // Statistics
    this.stats = {
      packetsReceived: 0,
      packetsConverted: 0,
      batchesSent: 0,
      conversionErrors: 0,
      sendErrors: 0
    };
  }

  /**
   * Initialize the server
   */
  async initialize() {
    try {
      // Ensure output directory exists if writing to file
      if (this.config.writeToFile) {
        await fs.promises.mkdir(this.config.outputDir, { recursive: true });
      }
      
      // Start the server
      await this.startServer();
      
      // Set up the flush interval
      this.flushIntervalId = setInterval(() => {
        this.conditionalFlush();
      }, this.config.flushInterval);
      
      // Register signal handlers for graceful shutdown
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));
      
      console.log(`HEP to InfluxDB Server initialized with config:`, this.config);
      
      // Return this for chaining
      return this;
    } catch (error) {
      console.error('Failed to initialize HEP to InfluxDB Server:', error);
      throw error;
    }
  }

  /**
   * Start the HEP server
   */
  async startServer() {
    const host = this.config.hepBindAddress;
    const port = this.config.hepPort;
    
    try {
      // Create UDP Server
      this.udpServer = Bun.udpSocket({
        hostname: host,
        port: port,
        udp: true,
        socket: {
          data: (socket, data) => this.handleData(data, socket),
          error: (socket, error) => console.error('UDP error:', error),
        }
      });
      
      // Create TCP Server
      this.tcpServer = Bun.listen({
        hostname: host,
        port: port,
        socket: {
          data: (socket, data) => this.handleData(data, socket),
          error: (socket, error) => console.error('TCP error:', error),
        }
      });
      
      console.log(`HEP Server listening on ${host}:${port} (TCP/UDP)`);
    } catch (error) {
      console.error(`Failed to start server:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming HEP data
   * @param {Buffer} data - Raw HEP packet data
   * @param {*} socket - Socket reference
   */
  handleData(data, socket) {
    try {
      this.stats.packetsReceived++;
      
      // Convert the HEP packet to Line Protocol
      const lineProtocol = this.converter.convertPacket(data);
      
      if (lineProtocol) {
        this.stats.packetsConverted++;
        // Add to buffer
        this.buffer.push(lineProtocol);
        
        // Flush if buffer size threshold is reached
        if (this.buffer.length >= this.config.batchSize) {
          this.flush();
        }
      }
    } catch (error) {
      this.stats.conversionErrors++;
      if (this.config.debug) {
        console.error('Error handling HEP data:', error);
      }
    }
  }

  /**
   * Flush buffer if conditions are met
   */
  conditionalFlush() {
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    
    // Flush if there are items in buffer and interval has passed
    if (this.buffer.length > 0 && timeSinceLastFlush >= this.config.flushInterval) {
      this.flush();
    }
  }

  /**
   * Flush buffer to InfluxDB
   */
  async flush() {
    if (this.buffer.length === 0) return;
    
    const data = this.buffer.join('\n');
    this.buffer = [];
    this.lastFlushTime = Date.now();
    
    try {
      // Write to InfluxDB
      if (!this.config.writeToFile) {
        await this.sendToInfluxDB(data);
      }
      
      // Write to file if configured
      if (this.config.writeToFile) {
        await this.writeToFile(data);
      }
      
      this.stats.batchesSent++;
      
      if (this.config.debug) {
        console.log(`Flushed ${data.split('\n').length} records`);
      }
    } catch (error) {
      this.stats.sendErrors++;
      console.error('Error flushing data:', error);
    }
  }

  /**
   * Send data to InfluxDB
   * @param {string} data - Line Protocol formatted data
   */
  async sendToInfluxDB(data) {
    const url = `${this.config.influxDbUrl}/write?db=${this.config.influxDbDatabase}`;
    
    try {
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'text/plain'
        }
      });
      
      if (response.status !== 204) {
        console.warn(`InfluxDB returned unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.error(`InfluxDB write error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write data to file
   * @param {string} data - Line Protocol formatted data
   */
  async writeToFile(data) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(this.config.outputDir, `hep_${timestamp}.lp`);
      
      await fs.promises.writeFile(filePath, data);
      
      if (this.config.debug) {
        console.log(`Wrote data to file: ${filePath}`);
      }
    } catch (error) {
      console.error(`File write error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get server statistics
   * @returns {Object} Server statistics
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.buffer.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Shutdown the server
   */
  async shutdown() {
    console.log('Shutting down HEP to InfluxDB server...');
    
    // Stop interval
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
    }
    
    // Flush remaining data
    await this.flush();
    
    // Stop TCP server
    if (this.tcpServer) {
      try {
        this.tcpServer.stop(true);
        this.tcpServer.unref();
      } catch (error) {
        console.error('Error stopping TCP server:', error);
      }
    }

    // Stop UDP server
    if (this.udpServer) {
      try {
        // UDP sockets use close() not stop()
        if (this.udpServer.close) this.udpServer.close();
      } catch (error) {
        console.error('Error stopping UDP server:', error);
      }
    }
    
    console.log('Server shutdown complete');
    
    // Final stats
    console.log('Final statistics:', this.getStats());
    
    process.exit(0);
  }
}

// Example usage
if (require.main === module) {
  const server = new HepToInfluxDBServer({
    debug: true,
    writeToFile: false
  });
  
  server.initialize().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default HepToInfluxDBServer;
