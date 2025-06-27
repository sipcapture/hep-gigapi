/**
 * Example usage of the HEP to InfluxDB Line Protocol Converter
 */

import HepToLineProtocolConverter from './hep-proto.js';
import hepjs from 'hep-js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Create an instance of the converter
const converter = new HepToLineProtocolConverter();
converter.setDebug(true); // Enable debug mode for more detailed logs

// Example function to create a test HEP packet
function createTestHepPacket() {
  const rcinfo = {
    type: 'HEP',
    version: 3,
    payload_type: 1, // SIP
    captureId: 2001,
    capturePass: 'myHep',
    srcIp: '192.168.1.1',
    dstIp: '192.168.1.2',
    srcPort: 5060,
    dstPort: 5060,
    timeSeconds: Math.floor(Date.now() / 1000),
    timeUseconds: (Date.now() % 1000) * 1000,
    proto_type: 1, // SIP
  };

  const payload = 
    'INVITE sip:alice@example.com SIP/2.0\r\n' +
    'Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK776asdhds\r\n' +
    'From: Bob <sip:bob@example.com>;tag=1928301774\r\n' +
    'To: Alice <sip:alice@example.com>\r\n' +
    'Call-ID: a84b4c76e66710@example.com\r\n' +
    'CSeq: 314159 INVITE\r\n' +
    'Contact: <sip:bob@192.168.1.1:5060>\r\n' +
    'Content-Type: application/sdp\r\n' +
    'Content-Length: 0\r\n\r\n';

  // Encode the HEP packet
  return hepjs.encapsulate(payload, rcinfo);
}

async function main() {
  try {
    console.log('=== HEP to InfluxDB Line Protocol Converter Example ===');
    
    // 1. Test with a single packet
    console.log('\n--- Single Packet Conversion ---');
    const packet = createTestHepPacket();
    const lineProtocol = converter.convertPacket(packet);
    console.log('Generated Line Protocol:');
    console.log(lineProtocol);
    
    // 2. Test with multiple packets
    console.log('\n--- Multiple Packet Conversion ---');
    const packets = [
      createTestHepPacket(),
      createTestHepPacket() // Create another test packet
    ];
    const multiLineProtocol = converter.convertPackets(packets);
    console.log('Generated Line Protocol (Multiple):');
    console.log(multiLineProtocol);
    
    // 3. Send to InfluxDB (uncomment to use)
    console.log('\n--- Sending to InfluxDB ---');
    const influxUrl = 'http://localhost:7971/write?db=mydb';
    const response = await axios.post(influxUrl, multiLineProtocol);
    console.log(`Response: ${response.status} ${response.statusText}`);
    
    // 4. Save to file
    console.log('\n--- Saving to File ---');
    const outputFile = path.join(__dirname, 'hep_output.lp');
    fs.writeFileSync(outputFile, multiLineProtocol);
    console.log(`Line Protocol data saved to: ${outputFile}`);
    
    
  } catch (error) {
    console.error('Error in example:', error);
  }
}

// Run the example
main().catch(console.error);

// --- Smarter Socket Test Section ---
async function isPortOpen(port, host, protocol = 'tcp') {
  if (protocol === 'tcp') {
    const net = await import('net');
    return await new Promise((resolve) => {
      const socket = net.createConnection({ port, host });
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        resolve(false);
      });
    });
  } else if (protocol === 'udp') {
    // UDP is connectionless, so we just try to send
    return true;
  }
  return false;
}

async function testAllSocketsSmart() {
  const packet = createTestHepPacket();
  const udpPort = 9060;
  const tcpPort = 9060;
  const http2Port = 8080;
  const http2Endpoint = '/test/api';
  const host = '127.0.0.1';
  const results = [];

  // UDP Test
  try {
    const udpOpen = await isPortOpen(udpPort, host, 'udp');
    if (!udpOpen) {
      results.push({ protocol: 'UDP', port: udpPort, status: 'DOWN', details: 'UDP port not open' });
    } else {
      const dgram = await import('dgram');
      const udpClient = dgram.createSocket('udp4');
      await new Promise((resolve, reject) => {
        udpClient.send(packet, udpPort, host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      udpClient.close();
      results.push({ protocol: 'UDP', port: udpPort, status: 'SENT', details: 'Packet sent (no response expected)' });
    }
  } catch (err) {
    results.push({ protocol: 'UDP', port: udpPort, status: 'FAIL', details: err.message });
  }

  // TCP Test
  try {
    const tcpOpen = await isPortOpen(tcpPort, host, 'tcp');
    if (!tcpOpen) {
      results.push({ protocol: 'TCP', port: tcpPort, status: 'DOWN', details: 'TCP port not open' });
    } else {
      const net = await import('net');
      await new Promise((resolve, reject) => {
        const client = net.createConnection({ port: tcpPort, host }, () => {
          client.write(packet);
          client.end();
          resolve();
        });
        client.on('error', reject);
      });
      results.push({ protocol: 'TCP', port: tcpPort, status: 'SENT', details: 'Packet sent (no response expected)' });
    }
  } catch (err) {
    results.push({ protocol: 'TCP', port: tcpPort, status: 'FAIL', details: err.message });
  }

  // HTTP/2 Test
  try {
    const http2Open = await isPortOpen(http2Port, host, 'tcp');
    if (!http2Open) {
      results.push({ protocol: 'HTTP/2', port: http2Port, status: 'DOWN', details: 'HTTP/2 port not open' });
    } else {
      let fetchImpl = globalThis.fetch;
      if (!fetchImpl) fetchImpl = (await import('node-fetch')).default;
      const url = `http://${host}:${http2Port}${http2Endpoint}`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: packet
      });
      const body = await res.text();
      if (res.status === 200) {
        results.push({ protocol: 'HTTP/2', port: http2Port, status: 'OK', details: `200 OK: ${body}` });
      } else {
        results.push({ protocol: 'HTTP/2', port: http2Port, status: 'FAIL', details: `${res.status}: ${body}` });
      }
    }
  } catch (err) {
    results.push({ protocol: 'HTTP/2', port: http2Port, status: 'FAIL', details: err.message });
  }

  // Print summary table
  console.log('\n=== Socket Test Summary ===');
  console.log('| Protocol | Port  | Status | Details');
  console.log('|----------|-------|--------|------------------------------------------');
  for (const r of results) {
    console.log(`| ${r.protocol.padEnd(8)} | ${String(r.port).padEnd(5)} | ${r.status.padEnd(6)} | ${r.details}`);
  }
  console.log('===========================================\n');
}

// If run with 'test' argument, run the smarter socket test
if (process.argv.includes('test')) {
  testAllSocketsSmart().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Socket test error:', err);
    process.exit(1);
  });
}
