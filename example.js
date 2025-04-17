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
    protocolType: 1, // UDP
    protocol: 'SIP'
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
    /*
    console.log('\n--- Sending to InfluxDB ---');
    const influxUrl = 'http://localhost:7971/write?db=mydb';
    const response = await axios.post(influxUrl, multiLineProtocol);
    console.log(`Response: ${response.status} ${response.statusText}`);
    */
    
    // 4. Save to file
    console.log('\n--- Saving to File ---');
    const outputFile = path.join(__dirname, 'hep_output.lp');
    fs.writeFileSync(outputFile, multiLineProtocol);
    console.log(`Line Protocol data saved to: ${outputFile}`);
    
    // 5. Process HEP packets from a capture file (example)
    /*
    console.log('\n--- Reading from Capture File ---');
    const captureFile = path.join(__dirname, 'hep_capture.pcap');
    if (fs.existsSync(captureFile)) {
      // This is just a placeholder - you would need actual pcap parsing logic
      const capturedPackets = parseHepFromPcap(captureFile);
      const captureLineProtocol = converter.convertPackets(capturedPackets);
      console.log(`Converted ${capturedPackets.length} packets`);
    }
    */
    
  } catch (error) {
    console.error('Error in example:', error);
  }
}

// Run the example
main().catch(console.error);
